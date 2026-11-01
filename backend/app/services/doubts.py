"""Doubt history: every question typed to the tutor, with its answer, newest first and searchable."""
from app import db
from app.errors import NotFoundError

PAGE = 50


def list_doubts(user_id: int, q: str = "", limit: int = PAGE) -> dict:
    sql = "SELECT id, question, answer, follow_up, topic, grounded, created_at FROM doubts WHERE user_id = ?"
    args = [user_id]
    for word in q.lower().split()[:5]:   # every word must appear in the question, the answer or the topic
        sql += " AND (LOWER(question) LIKE ? OR LOWER(answer) LIKE ? OR LOWER(COALESCE(topic, '')) LIKE ?)"
        args += [f"%{word}%"] * 3
    rows = db.query(sql + " ORDER BY id DESC LIMIT ?", (*args, min(max(limit, 1), PAGE)))
    total = db.one("SELECT COUNT(*) AS n FROM doubts WHERE user_id = ?", (user_id,))["n"]
    return {"doubts": [{**r, "grounded": bool(r["grounded"])} for r in rows], "total": total, "query": q}


def delete_doubt(user_id: int, doubt_id: int) -> dict:
    if not db.one("SELECT id FROM doubts WHERE id = ? AND user_id = ?", (doubt_id, user_id)):
        raise NotFoundError("Unknown doubt")
    db.execute("DELETE FROM doubts WHERE id = ?", (doubt_id,))
    return {"deleted": doubt_id}


def clear(user_id: int) -> dict:
    db.execute("DELETE FROM doubts WHERE user_id = ?", (user_id,))
    return {"cleared": True}
