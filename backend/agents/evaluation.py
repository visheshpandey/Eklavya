"""Evaluation agent: grade a typed/spoken answer server-side, name the misconception, update mastery.

grade() is the contract P3's grade_answer tool and POST /api/quiz/submit both call.
"""
import re

import db
from mastery import severity_for, update_mastery
from agents import misconception
from agents.logger import log_agent

# speech recognisers often write letters as words
SPOKEN_LETTERS = {"ay": "A", "eh": "A", "bee": "B", "be": "B", "see": "C", "sea": "C", "dee": "D"}


def parse_choice(answer: str, options):
    """Return 'A'-'D' or None if the answer cannot be mapped to an option."""
    text = (answer or "").strip()
    if not text:
        return None
    words = re.findall(r"[\w']+", text.lower())
    short = len(words) <= 4
    m = re.search(r"\boption\s*([abcd])\b", text, re.I)
    if m:
        return m.group(1).upper()
    if short:
        for w in words:
            if w in ("a", "b", "c", "d"):
                return w.upper()
            if w in SPOKEN_LETTERS:
                return SPOKEN_LETTERS[w]
    # longer answers: match the option text the student repeated
    ans = set(re.findall(r"\w+", text.lower()))
    best, best_score = None, 0.0
    for i, opt in enumerate(options):
        body = re.sub(r"^[A-D][.)]\s*", "", opt)
        toks = set(re.findall(r"\w+", body.lower()))
        if not toks:
            continue
        score = len(ans & toks) / len(toks)
        if score > best_score:
            best, best_score = "ABCD"[i], score
    return best if best_score >= 0.6 else None


def grade(user_id: int, question_id: int, student_answer: str, confidence: float = None):
    q = db.one("SELECT * FROM quiz_questions WHERE id = ?", (question_id,))
    if not q:
        raise ValueError("Unknown question_id")
    options = db.loads(q["options"], [])
    letter = parse_choice(student_answer, options)
    if letter is None:
        return {"unclear": True, "is_correct": None, "misconception": None,
                "message": "Could not tell which option was chosen. Ask the student to say A, B, C or D."}

    if confidence is None:  # derived from the latest voice tone signal when the caller gave none
        confidence = db.latest_confidence(user_id)
    confidence = min(max(float(confidence), 0.0), 1.0)

    topic_id = q["topic_id"]
    is_correct = letter == q["correct"]
    found = None
    if not is_correct:  # may call Gemini; do it before any write so a failure leaves no partial state
        found = misconception.classify(q, letter, student_answer)
        found["severity"] = severity_for(confidence)
    row = db.one("SELECT mastery_score FROM learner_mastery WHERE user_id = ? AND topic_id = ?", (user_id, topic_id))
    before = row["mastery_score"] if row else 50.0
    after = update_mastery(before, is_correct, confidence)
    db.execute(
        "INSERT INTO learner_mastery (user_id, topic_id, mastery_score, confidence_score) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(user_id, topic_id) DO UPDATE SET mastery_score = excluded.mastery_score, "
        "confidence_score = excluded.confidence_score, last_updated = CURRENT_TIMESTAMP",
        (user_id, topic_id, after, confidence))

    resolved = 0
    if is_correct:
        resolved = _resolve(user_id, topic_id)
    else:
        db.execute(
            "INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity) VALUES (?, ?, ?, ?, ?)",
            (user_id, topic_id, found["text"], found["label"], found["severity"]))

    db.execute(
        "INSERT INTO quiz_attempts (user_id, topic_id, question_id, question, student_answer, is_correct,"
        " confidence, mastery_before, mastery_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, topic_id, question_id, q["question"], student_answer, int(is_correct), confidence, before, after))

    topic = db.one("SELECT topic_name FROM topics WHERE id = ?", (topic_id,))["topic_name"]
    if is_correct:
        action = "Review next question" + (f"; resolved {resolved} misconception(s)" if resolved else "")
        log_agent(user_id, "evaluation", f"Correct on {topic} (confidence {confidence:.2f})",
                  f"Mastery {before} -> {after}", action, confidence)
    else:
        action = "Generate a mission to fix this misconception"
        log_agent(user_id, "misconception", f"Wrong on {topic}: chose {letter}, correct {q['correct']}",
                  f"Diagnosis [{found['label']}, {found['severity']}]: {found['text']}",
                  action, confidence)

    return {
        "is_correct": is_correct, "chosen": letter, "correct_answer": q["correct"],
        "explanation": q["explanation"], "topic": topic, "topic_id": topic_id,
        "misconception": found, "misconceptions_resolved": resolved,
        "confidence_used": confidence, "mastery_before": before, "mastery_after": after,
        "recommended_action": action,
    }


def _resolve(user_id: int, topic_id: int) -> int:
    with db.get_conn() as c:
        cur = c.execute("UPDATE misconceptions SET resolved = 1 WHERE user_id = ? AND topic_id = ? AND resolved = 0",
                        (user_id, topic_id))
        return cur.rowcount
