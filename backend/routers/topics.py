"""GET /api/topics/{topic_id}: everything the student sees when they pick a topic."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

import db

router = APIRouter()


@router.get("/api/topics/{topic_id}")
def topic_detail(topic_id: int, user_id: int = 1):
    t = db.one("SELECT id, topic_name, document_id FROM topics WHERE id = ?", (topic_id,))
    if not t:
        return JSONResponse(status_code=404, content={"error": "Unknown topic"})
    m = db.one("SELECT mastery_score, confidence_score FROM learner_mastery WHERE user_id = ? AND topic_id = ?", (user_id, topic_id))
    notes = db.query("SELECT heading, text FROM chunks WHERE topic_id = ? ORDER BY id", (topic_id,))
    mis = db.query("SELECT misconception_text, severity FROM misconceptions WHERE user_id = ? AND topic_id = ? AND resolved = 0 ORDER BY id DESC", (user_id, topic_id))
    n_q = db.one("SELECT COUNT(*) AS n FROM quiz_questions WHERE topic_id = ?", (topic_id,))["n"]
    return {"topic_id": t["id"], "topic_name": t["topic_name"], "document_id": t["document_id"],
            "mastery": m["mastery_score"] if m else 50, "notes": notes, "open_misconceptions": mis, "question_count": n_q}
