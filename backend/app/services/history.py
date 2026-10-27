"""GET /api/history: finished viva practices and debates, newest first. GET /api/boards: today's whiteboards."""
from app import db
from app.services.progress_data import local_date, local_today

LIMIT = 10


def history(user_id: int):
    vivas = db.query(
        "SELECT v.id, t.topic_name AS topic, v.marks, v.out_of, v.strengths, v.improve, v.finished_at "
        "FROM vivas v LEFT JOIN topics t ON t.id = v.topic_id WHERE v.user_id = ? AND v.finished_at IS NOT NULL "
        "ORDER BY v.id DESC LIMIT ?", (user_id, LIMIT))
    debates = db.query(
        "SELECT b.id, t.topic_name AS topic, b.motion, b.tutor_side, b.style, b.winner, b.student_score, b.tutor_score, "
        "b.strength, b.improve, b.finished_at FROM debates b LEFT JOIN topics t ON t.id = b.topic_id "
        "WHERE b.user_id = ? AND b.finished_at IS NOT NULL ORDER BY b.id DESC LIMIT ?", (user_id, LIMIT))
    return {"vivas": vivas, "debates": debates}


def boards_today(user_id: int):
    """Every whiteboard drawn today, in order, across all sessions (the study pack prints them)."""
    today = local_today()
    rows = db.query("SELECT data, created_at FROM boards WHERE user_id = ? ORDER BY id DESC LIMIT 200", (user_id,))
    return [db.loads(r["data"], {}) for r in reversed(rows) if local_date(r["created_at"]) == today]
