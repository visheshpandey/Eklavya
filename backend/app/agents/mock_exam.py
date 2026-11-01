"""Mock exam agent: a timed paper across all of the student's topics, then a score report.

Questions come from the stored question bank (Gemini writes more only for topics that have too few). Every answer is
graded by the evaluation agent, so a mock exam moves mastery and names misconceptions like any other test.
Unanswered questions count as wrong but leave mastery alone.
"""
import math
import random
from datetime import datetime, timezone

from app import db
from app.agents import evaluation, quiz
from app.agents.logger import log_agent
from app.errors import BadRequestError, LLMError, NotFoundError

GRACE_SECONDS = 120   # a late submit (slow network, a sleeping phone) is still accepted for this long


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _public_item(row: dict, options: list) -> dict:
    return {"position": row["position"], "question_id": row["question_id"], "topic": row["topic"],
            "question": row["question"], "options": options}


def start(user_id: int, count: int = 10, minutes: int = 15) -> dict:
    topics = db.query(
        "SELECT t.id, t.topic_name, COALESCE(m.mastery_score, 50) AS mastery FROM topics t "
        "JOIN documents d ON d.id = t.document_id LEFT JOIN learner_mastery m ON m.topic_id = t.id AND m.user_id = d.user_id "
        "WHERE d.user_id = ? ORDER BY mastery ASC, t.id", (user_id,))
    if not topics:
        raise BadRequestError("Upload your notes first, then take a mock exam.")
    topics = topics[:count]                       # more topics than questions: the weakest ones get a question each
    per_topic = math.ceil(count / len(topics))
    picked = []
    for topic in topics:
        stored = db.query("SELECT id, options FROM quiz_questions WHERE topic_id = ?", (topic["id"],))
        if len(stored) < per_topic:
            quiz.warm_up(topic["id"], per_topic)   # best effort: a topic Gemini cannot write for just gives fewer
            stored = db.query("SELECT id, options FROM quiz_questions WHERE topic_id = ?", (topic["id"],))
        picked += [(topic, q) for q in random.sample(stored, min(per_topic, len(stored)))]
    if not picked:
        raise BadRequestError("Could not get questions for your topics right now. Try again in a minute.")
    random.shuffle(picked)
    picked = picked[:count]

    exam_id = db.execute("INSERT INTO mock_exams (user_id, minutes, total) VALUES (?, ?, ?)", (user_id, minutes, len(picked)))
    items = []
    for position, (topic, q) in enumerate(picked, start=1):
        full = db.one("SELECT question, correct FROM quiz_questions WHERE id = ?", (q["id"],))
        row = {"exam_id": exam_id, "position": position, "question_id": q["id"], "topic_id": topic["id"],
               "topic": topic["topic_name"], "question": full["question"], "correct": full["correct"]}
        db.execute("INSERT INTO mock_exam_items (exam_id, position, question_id, topic_id, topic, question, correct) "
                   "VALUES (?, ?, ?, ?, ?, ?, ?)", tuple(row[k] for k in ("exam_id", "position", "question_id", "topic_id",
                                                                         "topic", "question", "correct")))
        items.append(_public_item(row, db.loads(q["options"], [])))
    log_agent(user_id, "mock_exam", f"Mock exam asked: {count} questions, {minutes} minutes",
              f"Picked {len(items)} questions across {len({i['topic'] for i in items})} topics, weakest first",
              "Started a timed paper", 0.8)
    return {"exam_id": exam_id, "minutes": minutes, "total": len(items), "questions": items}


def submit(user_id: int, exam_id: int, answers: dict) -> dict:
    """``answers`` maps a question position (as text or int) to the chosen letter A-D; missing = unanswered."""
    exam = db.one("SELECT * FROM mock_exams WHERE id = ? AND user_id = ?", (exam_id, user_id))
    if not exam:
        raise NotFoundError("Unknown mock exam")
    if exam["finished_at"]:
        return report(user_id, exam_id)
    started = datetime.fromisoformat(exam["started_at"].replace(" ", "T"))
    seconds = int((_now() - started).total_seconds())
    late = seconds > exam["minutes"] * 60 + GRACE_SECONDS
    chosen = {int(k): str(v).strip().upper()[:1] for k, v in (answers or {}).items() if str(v).strip()}
    correct = 0
    for item in db.query("SELECT * FROM mock_exam_items WHERE exam_id = ? ORDER BY position", (exam_id,)):
        letter = None if late else chosen.get(item["position"])
        if letter not in ("A", "B", "C", "D"):
            letter = None
        is_correct = False
        if letter and db.one("SELECT id FROM quiz_questions WHERE id = ?", (item["question_id"],)):
            try:
                is_correct = bool(evaluation.grade(user_id, item["question_id"], letter, confidence=0.6)["is_correct"])
            except LLMError:   # naming the mistake needed Gemini and it failed: the mark still counts, mastery waits
                is_correct = letter == item["correct"]
        elif letter:           # the notes were removed after the exam started
            is_correct = letter == item["correct"]
        correct += is_correct
        db.execute("UPDATE mock_exam_items SET answer = ?, is_correct = ? WHERE id = ?", (letter, int(is_correct), item["id"]))
    db.execute("UPDATE mock_exams SET correct = ?, finished_at = CURRENT_TIMESTAMP, seconds = ? WHERE id = ?",
               (correct, min(seconds, exam["minutes"] * 60), exam_id))
    log_agent(user_id, "mock_exam", f"Mock exam handed in after {seconds // 60} min" + (" (too late, not graded)" if late else ""),
              f"Score {correct}/{exam['total']}", "Showed the score report", 0.8)
    return report(user_id, exam_id)


def report(user_id: int, exam_id: int) -> dict:
    exam = db.one("SELECT * FROM mock_exams WHERE id = ? AND user_id = ?", (exam_id, user_id))
    if not exam:
        raise NotFoundError("Unknown mock exam")
    items = db.query("SELECT * FROM mock_exam_items WHERE exam_id = ? ORDER BY position", (exam_id,))
    by_topic = {}
    for item in items:
        row = by_topic.setdefault(item["topic"], {"topic": item["topic"], "topic_id": item["topic_id"], "correct": 0, "total": 0})
        row["total"] += 1
        row["correct"] += bool(item["is_correct"])
    topics = sorted(by_topic.values(), key=lambda t: (t["correct"] / t["total"], t["topic"]))
    review = []
    for item in items:
        q = db.one("SELECT options, explanation FROM quiz_questions WHERE id = ?", (item["question_id"],))
        review.append({"position": item["position"], "topic": item["topic"], "question": item["question"],
                       "answer": item["answer"], "correct": item["correct"], "is_correct": bool(item["is_correct"]),
                       "options": db.loads(q["options"], []) if q else [], "explanation": q["explanation"] if q else ""})
    total = exam["total"] or 0
    score = exam["correct"] or 0
    return {"exam_id": exam_id, "finished": bool(exam["finished_at"]), "minutes": exam["minutes"], "seconds": exam["seconds"],
            "correct": score, "total": total, "percent": round(100 * score / total) if total else 0,
            "answered": sum(1 for i in items if i["answer"]), "topics": topics,
            "weak_topics": [t["topic"] for t in topics if t["correct"] / t["total"] < 0.6][:3],
            "review": review, "started_at": exam["started_at"]}


def history(user_id: int) -> list:
    rows = db.query("SELECT id, minutes, total, correct, started_at, seconds FROM mock_exams "
                    "WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 20", (user_id,))
    return [{"exam_id": r["id"], "minutes": r["minutes"], "total": r["total"], "correct": r["correct"],
             "percent": round(100 * r["correct"] / r["total"]) if r["total"] else 0,
             "seconds": r["seconds"], "started_at": r["started_at"]} for r in rows]
