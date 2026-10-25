"""Decision log: every agent/tool step is written to agent_logs (observation -> decision -> action)."""
from app import db


def log_agent(user_id, agent_name, observation, decision, action_taken, confidence=None):
    return db.execute(
        "INSERT INTO agent_logs (user_id, agent_name, observation, decision, action_taken, confidence)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, agent_name, str(observation), str(decision), str(action_taken), confidence),
    )


def recent(user_id, limit=30):
    return db.query(
        "SELECT agent_name, observation, decision, action_taken, confidence, created_at "
        "FROM agent_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    )
