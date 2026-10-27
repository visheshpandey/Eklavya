"""GET /api/today: the home screen. Streak, what is due for revision, a short plan for today, the last session."""
from datetime import date

from app import db
from app.domain.planner import build_plan
from app.domain.revision import due_topics, interval_days
from app.domain.streak import study_streak
from app.services.progress_data import active_days, local_date, local_today, topics_with_progress

REVISE_MINUTES = 5
LEARN_MINUTES = 10
MAX_DUE_IN_PLAN = 2
MODE_NAMES = {"learn": "Lesson", "test": "Voice test", "debate": "Debate", "viva": "Viva practice",
              "revise": "Quick revision", "free": "Conversation"}


def _last_session(user_id: int):
    row = db.one(
        "SELECT v.study_mode, v.turns, v.started_at, t.topic_name FROM voice_sessions v "
        "LEFT JOIN topics t ON t.id = v.topic_id WHERE v.user_id = ? AND v.turns > 0 ORDER BY v.id DESC LIMIT 1",
        (user_id,))
    if not row:
        return None
    return {"mode": row["study_mode"] or "free", "mode_name": MODE_NAMES.get(row["study_mode"] or "free", "Conversation"),
            "topic": row["topic_name"], "turns": row["turns"], "date": str(local_date(row["started_at"]) or "")}


def today(user_id: int):
    day = local_today()
    topics = topics_with_progress(user_id)
    user = db.one("SELECT name, target_exam_date, daily_study_minutes FROM users WHERE id = ?", (user_id,)) or {}
    due = due_topics(topics, day)
    new = sorted((t for t in topics if t["last_practised"] is None), key=lambda t: t["mastery"])
    mission = db.one("SELECT topic_id, mission_title FROM study_missions WHERE user_id = ? AND status = 'active' "
                     "ORDER BY id DESC LIMIT 1", (user_id,))

    plan = _exam_plan_today(user, topics, day)
    if plan is None:
        plan = _default_plan(due, new, mission, topics)
    return _payload(user_id, user, day, topics, due, plan)


def _exam_plan_today(user: dict, topics, day):
    """With an exam date, Today shows exactly what the exam planner scheduled for today (one plan, one source)."""
    exam = user.get("target_exam_date")
    if not exam or not topics:
        return None
    try:
        plan = build_plan(topics, day, date.fromisoformat(exam), user.get("daily_study_minutes") or 30)
    except ValueError:
        return None   # the exam date has passed
    items = plan["days"][0]["items"] if plan["days"] and plan["days"][0]["date"] == day.isoformat() else []
    return [{**item, "reason": "From your exam plan."} for item in items]


def _default_plan(due, new, mission, topics):
    plan = [{"kind": "revise", "topic_id": t["topic_id"], "topic": t["topic_name"], "minutes": REVISE_MINUTES,
             "reason": f"Last practised {t['last_practised'].isoformat()}; at {round(t['mastery'])}% it comes back "
                       f"every {interval_days(t['mastery'])} day(s)."} for t in due[:MAX_DUE_IN_PLAN]]
    planned = {item["topic_id"] for item in plan}
    by_id = {t["topic_id"]: t for t in topics}
    if mission and mission["topic_id"] in by_id and mission["topic_id"] not in planned:
        t = by_id[mission["topic_id"]]
        plan.append({"kind": "learn", "topic_id": t["topic_id"], "topic": t["topic_name"], "minutes": LEARN_MINUTES,
                     "reason": f"Your mission: {mission['mission_title']}"})
    elif new and new[0]["topic_id"] not in planned:
        t = new[0]
        plan.append({"kind": "learn", "topic_id": t["topic_id"], "topic": t["topic_name"], "minutes": LEARN_MINUTES,
                     "reason": f"Not practised yet and your weakest new topic ({round(t['mastery'])}%)."})
    return plan


def _payload(user_id, user, day, topics, due, plan):
    exam = user.get("target_exam_date")
    exam_day = local_date(f"{exam} 12:00:00") if exam else None
    return {
        "date": day.isoformat(),
        "name": user.get("name") or "",
        "streak": study_streak(active_days(user_id), day),
        "has_notes": bool(topics),
        "due": [{"topic_id": t["topic_id"], "topic": t["topic_name"], "mastery": t["mastery"],
                 "overdue_days": t["overdue_days"]} for t in due],
        "plan": plan,
        "plan_minutes": sum(item["minutes"] for item in plan),
        "last_session": _last_session(user_id),
        "exam_date": exam,
        "exam_days_left": (exam_day - day).days if exam_day else None,
    }
