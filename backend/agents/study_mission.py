"""Study Mission agent: rank weak topics, produce one short timed mission and say why.

Ranking: unresolved misconception severity first, then lowest mastery. Gemini writes the
mission; a Gemini failure raises (no canned mission).
"""
import db
from gemini import LLMError, llm_json
from agents.logger import log_agent

SYSTEM = "You are a study coach. Write a short, concrete study mission. Respond with valid JSON only."
SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}


def _priority(mastery: float, severity: str = None) -> str:
    if severity == "high" or mastery < 50:
        return "High"
    return "Medium" if mastery < 70 else "Low"


def _pick_target(user_id: int):
    rows = db.query(
        "SELECT m.topic_id, m.mastery_score, t.topic_name, t.document_id FROM learner_mastery m "
        "JOIN topics t ON t.id = m.topic_id WHERE m.user_id = ?", (user_id,))
    if not rows:
        return None
    open_mis = {}
    for r in db.query("SELECT * FROM misconceptions WHERE user_id = ? AND resolved = 0 ORDER BY id DESC", (user_id,)):
        open_mis.setdefault(r["topic_id"], r)  # latest unresolved per topic

    def key(r):
        sev = SEVERITY_RANK.get((open_mis.get(r["topic_id"]) or {}).get("severity"), 0)
        return (-sev, r["mastery_score"])

    target = sorted(rows, key=key)[0]
    return target, open_mis.get(target["topic_id"])


def generate(user_id: int):
    """POST /api/missions/generate. Returns the mission dict (also stored)."""
    picked = _pick_target(user_id)
    if not picked:
        raise ValueError("No topics yet. Upload notes first.")
    target, mis = picked
    topic, mastery = target["topic_name"], target["mastery_score"]
    priority = _priority(mastery, mis["severity"] if mis else None)

    chunk = db.one("SELECT text FROM chunks WHERE topic_id = ? LIMIT 1", (target["topic_id"],))
    prompt = f"""Topic: {topic}. Mastery: {mastery:.0f}%.
Misconception: {mis['misconception_text'] if mis else 'none detected'}
Notes excerpt: {(chunk or {}).get('text', '')[:800]}
Return JSON {{"mission_title": "short, e.g. Fix X vs Y Confusion", "reason": "1-2 sentences why this mission, citing the mistake", "tasks": ["task 1", "task 2", "task 3"]}}
Total time 15 minutes. Tasks must be concrete and doable."""
    d = llm_json(SYSTEM, prompt, required_keys=("mission_title", "reason", "tasks"), temperature=0.4)
    if not isinstance(d["tasks"], list) or not d["tasks"]:
        raise LLMError("Gemini returned a mission without tasks")
    title, reason, tasks = d["mission_title"], d["reason"], d["tasks"]

    db.execute("UPDATE study_missions SET status = 'superseded' WHERE user_id = ? AND status = 'active'", (user_id,))
    mid = db.execute(
        "INSERT INTO study_missions (user_id, topic_id, mission_title, reason, duration_minutes, priority, tasks)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, target["topic_id"], title, reason, 15, priority, db.dumps(tasks)))
    log_agent(user_id, "study_mission",
              f"Weakest: {topic} at {mastery:.0f}%" + (f", open misconception ({mis['severity']})" if mis else ""),
              f"Prioritise {topic} ({priority})", f"Created mission: {title}", 0.85)
    return {"mission_id": mid, "topic_id": target["topic_id"], "topic": topic, "mission_title": title,
            "duration_minutes": 15, "priority": priority, "reason": reason, "tasks": tasks}


def current(user_id: int):
    """Contract for P3's get_mission tool: the active mission, creating one if none exists."""
    row = db.one("SELECT * FROM study_missions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", (user_id,))
    if not row:
        return generate(user_id)
    topic = db.one("SELECT topic_name FROM topics WHERE id = ?", (row["topic_id"],))
    return {"mission_id": row["id"], "topic_id": row["topic_id"], "topic": topic["topic_name"] if topic else "",
            "mission_title": row["mission_title"], "duration_minutes": row["duration_minutes"],
            "priority": row["priority"], "reason": row["reason"], "tasks": db.loads(row["tasks"], [])}
