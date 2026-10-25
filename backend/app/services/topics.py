"""What the student sees when they pick a topic: its notes, mastery and open mistakes."""
from app import db
from app.domain import retrieval
from app.errors import NotFoundError

RELATED_MIN_SHARE = 0.4   # a closest passage must score at least this share of the best one


def topic_detail(topic_id: int, user_id: int) -> dict:
    topic = db.one("SELECT id, topic_name, document_id FROM topics WHERE id = ?", (topic_id,))
    if not topic:
        raise NotFoundError("Unknown topic")
    mastery = db.one("SELECT mastery_score FROM learner_mastery WHERE user_id = ? AND topic_id = ?", (user_id, topic_id))
    notes = db.query("SELECT heading, text FROM chunks WHERE topic_id = ? ORDER BY id", (topic_id,))
    related = not notes
    if related:   # no chunk was assigned to this topic: show the closest passages of the same document instead
        hits = retrieval.retrieve(topic["document_id"], topic["topic_name"], k=2)
        best = hits[0]["score"] if hits else 0
        notes = [{"heading": hit["heading"], "text": hit["text"]} for hit in hits
                 if hit["score"] >= RELATED_MIN_SHARE * best]   # drop a weak runner-up padding the list
    open_misconceptions = db.query(
        "SELECT misconception_text, severity FROM misconceptions "
        "WHERE user_id = ? AND topic_id = ? AND resolved = 0 ORDER BY id DESC", (user_id, topic_id))
    question_count = db.one("SELECT COUNT(*) AS n FROM quiz_questions WHERE topic_id = ?", (topic_id,))["n"]
    return {"topic_id": topic["id"], "topic_name": topic["topic_name"], "document_id": topic["document_id"],
            "mastery": mastery["mastery_score"] if mastery else 50, "notes": notes, "notes_are_related": related,
            "open_misconceptions": open_misconceptions, "question_count": question_count}
