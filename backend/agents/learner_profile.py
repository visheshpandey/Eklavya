"""Learner Profile agent: read-only summary of language, study time and mastery."""
import db


def profile(user_id: int):
    user = db.one("SELECT * FROM users WHERE id = ?", (user_id,)) or {}
    mastery = db.query(
        "SELECT t.id AS topic_id, t.topic_name, m.mastery_score, m.confidence_score FROM learner_mastery m "
        "JOIN topics t ON t.id = m.topic_id WHERE m.user_id = ? ORDER BY t.id", (user_id,))
    return {"user_id": user_id, "name": user.get("name"),
            "preferred_language": user.get("preferred_language", "hinglish"),
            "daily_study_minutes": user.get("daily_study_minutes", 30), "mastery": mastery}
