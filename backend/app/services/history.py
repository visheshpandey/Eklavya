"""GET /api/history: finished viva practices and debates, newest first."""
from app import db

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
