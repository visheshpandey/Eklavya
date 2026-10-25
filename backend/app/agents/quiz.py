"""Quiz agent: pick the weakest topic, serve stored questions, top up with Gemini when short.

Questions are stored with a per-wrong-option misconception so grading can name the exact
root error without another LLM call (and the demo keeps working if the LLM is down).
"""
import random

from app import db
from app.agents.logger import log_agent
from app.ai.gemini import llm_json
from app.domain import retrieval
from app.domain.misconceptions import LABELS
from app.errors import LLMError, NotFoundError

SYSTEM = "You write multiple-choice questions that expose specific misconceptions. Respond with valid JSON only."


def weakest_topic(user_id: int, document_id: int = None):
    """Topic with the lowest mastery (that has chunks); None if the user has no topics."""
    sql = ("SELECT m.topic_id, m.mastery_score, t.topic_name FROM learner_mastery m "
           "JOIN topics t ON t.id = m.topic_id WHERE m.user_id = ?")
    args = [user_id]
    if document_id:
        sql += " AND t.document_id = ?"
        args.append(document_id)
    rows = db.query(sql + " ORDER BY m.mastery_score ASC, m.topic_id ASC", tuple(args))
    return rows[0] if rows else None


def _public(q, topic_name):
    """Question as the student sees it: never includes the answer or misconceptions."""
    return {"question_id": q["id"], "topic_id": q["topic_id"], "topic": topic_name,
            "question": q["question"], "options": db.loads(q["options"], []),
            "difficulty": q["difficulty"]}


def _generate_with_llm(topic_id: int, count: int, difficulty: str):
    topic = db.one("SELECT id, document_id, topic_name FROM topics WHERE id = ?", (topic_id,))
    if not topic:
        return []
    chunks = retrieval.retrieve(topic["document_id"], topic["topic_name"], k=4)
    context = "\n\n".join(c["text"] for c in chunks) or topic["topic_name"]
    prompt = f"""Write exactly {count} {difficulty}-level multiple-choice questions about "{topic['topic_name']}", using ONLY the notes below.
Return JSON:
{{"questions": [{{
  "question": "text",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct": "A",
  "explanation": "why it is correct",
  "misconceptions": {{"B": {{"label": "<one of {', '.join(LABELS)}>", "text": "the wrong belief that makes a student choose B"}}}}
}}]}}
Every wrong option must have a misconceptions entry. Make wrong options plausible, each reflecting a different wrong belief.

Notes:
{context}"""
    data = llm_json(SYSTEM, prompt, required_keys=("questions",), temperature=0.6)
    ids = []
    for q in data["questions"]:
        try:
            opts, correct = q["options"], str(q["correct"]).strip().upper()[:1]
            if len(opts) != 4 or correct not in "ABCD":
                continue
            ids.append(db.execute(
                "INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions, difficulty)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (topic_id, q["question"], db.dumps(opts), correct, q.get("explanation", ""),
                 db.dumps(q.get("misconceptions", {})), difficulty)))
        except (KeyError, TypeError):
            continue
    return ids


def generate(user_id: int, topic_id: int, count: int = 5, difficulty: str = "Medium"):
    """POST /api/quiz/generate: stored questions first, LLM top-up if fewer than `count`."""
    topic = db.one("SELECT topic_name FROM topics WHERE id = ?", (topic_id,))
    if not topic:
        raise NotFoundError("Unknown topic_id")
    rows = db.query("SELECT * FROM quiz_questions WHERE topic_id = ? ORDER BY id", (topic_id,))
    topped_up = False
    if len(rows) < count:
        topped_up = bool(_generate_with_llm(topic_id, count - len(rows), difficulty))
        if not topped_up and not rows:
            raise LLMError("Gemini returned no usable questions for this topic.")
        rows = db.query("SELECT * FROM quiz_questions WHERE topic_id = ? ORDER BY id", (topic_id,))
    chosen = rows[:count]
    log_agent(user_id, "quiz", f"Quiz requested for {topic['topic_name']} ({difficulty}, {count})",
              f"Served {len(chosen)} questions", "Gemini generated new questions" if topped_up else "Used stored questions", 0.8)
    return [_public(q, topic["topic_name"]) for q in chosen]


def next_question(user_id: int, topic_id: int = None, exclude=None):
    """Contract for P3: the next question on the weakest (or given) topic, skipping `exclude` ids
    (questions already asked this session). Tops up with Gemini when the topic has none left.
    Returns None when no question can be found."""
    exclude = set(exclude or [])
    if topic_id is None:
        w = weakest_topic(user_id)
        if not w:
            return None
        topic_id = w["topic_id"]
    topic = db.one("SELECT topic_name FROM topics WHERE id = ?", (topic_id,))
    if not topic:
        return None

    def fresh():
        rows = db.query("SELECT * FROM quiz_questions WHERE topic_id = ? ORDER BY id", (topic_id,))
        return [q for q in rows if q["id"] not in exclude]

    rows = fresh()
    if not rows:
        _generate_with_llm(topic_id, 3, "Medium")
        rows = fresh()
    if not rows:
        return None
    solved = {r["question_id"] for r in db.query(
        "SELECT DISTINCT question_id FROM quiz_attempts WHERE user_id = ? AND topic_id = ? AND is_correct = 1",
        (user_id, topic_id))}
    pool = [q for q in rows if q["id"] not in solved] or rows
    return _public(pool[0], topic["topic_name"])
