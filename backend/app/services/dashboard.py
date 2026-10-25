"""Everything the dashboard shows, in one payload: mastery, weak topics, alerts, mission, history, decision log."""
from app import db
from app.agents import logger, study_mission

WEAK_BELOW = 60          # topics under this mastery % count as weak
HISTORY_LIMIT = 20
LEARNER_STATE_LIMIT = 10


def build_dashboard(user_id: int) -> dict:
    mastery = db.query(
        "SELECT t.id AS topic_id, t.topic_name, t.document_id, d.file_name AS document, m.mastery_score, m.confidence_score "
        "FROM learner_mastery m JOIN topics t ON t.id = m.topic_id JOIN documents d ON d.id = t.document_id "
        "WHERE m.user_id = ? ORDER BY d.id DESC, t.id", (user_id,))
    weak = sorted((m for m in mastery if m["mastery_score"] < WEAK_BELOW), key=lambda m: m["mastery_score"])
    open_misconceptions = db.query(
        "SELECT x.id, x.topic_id, t.topic_name, x.misconception_text, x.label, x.severity, x.detected_at "
        "FROM misconceptions x JOIN topics t ON t.id = x.topic_id "
        "WHERE x.user_id = ? AND x.resolved = 0 ORDER BY x.id DESC", (user_id,))
    resolved = db.one("SELECT COUNT(*) AS n FROM misconceptions WHERE user_id = ? AND resolved = 1", (user_id,))["n"]
    alerts = [{"type": "misconception", "severity": m["severity"], "topic": m["topic_name"],
               "message": m["misconception_text"]} for m in open_misconceptions]
    alerts += [{"type": "weak_topic", "severity": "medium", "topic": w["topic_name"],
                "message": f"{w['topic_name']} mastery is {w['mastery_score']:.0f}%"} for w in weak[:3]]
    has_mission = db.one("SELECT id FROM study_missions WHERE user_id = ? AND status = 'active' LIMIT 1", (user_id,))
    history = db.query(
        "SELECT a.question, a.student_answer, a.is_correct, a.mastery_before, a.mastery_after, a.answered_at, t.topic_name "
        "FROM quiz_attempts a JOIN topics t ON t.id = a.topic_id WHERE a.user_id = ? ORDER BY a.id DESC LIMIT ?",
        (user_id, HISTORY_LIMIT))
    progress = db.query(
        "SELECT a.id AS attempt_id, a.topic_id, t.topic_name, a.mastery_before, a.mastery_after, a.is_correct, a.answered_at "
        "FROM quiz_attempts a JOIN topics t ON t.id = a.topic_id WHERE a.user_id = ? ORDER BY a.id", (user_id,))
    return {
        "mastery": mastery, "weak_topics": weak, "alerts": alerts,
        "mission": study_mission.current(user_id) if has_mission else None,
        "quiz_history": history, "progress": progress, "misconceptions_resolved": resolved,
        "learner_state": db.query(
            "SELECT topic_id, confusion, confidence, frustration, note, created_at FROM learner_state "
            "WHERE user_id = ? ORDER BY id DESC LIMIT ?", (user_id, LEARNER_STATE_LIMIT)),
        "agent_log": logger.recent(user_id, 30),
    }
