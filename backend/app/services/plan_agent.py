"""The study planner agent: it builds the day-by-day plan on its own, remembers what it planned, and when the student has missed
planned days it re-plans and says what changed. Every decision goes to the agent log.

It acts without being asked: nothing but the exam date comes from the student. It plans from the topics that are weakest now
and the ones fading from memory (the forgetting curve), and checks yesterday's plan against what the student really did.
"""
import json
from datetime import date

from app import db
from app.agents.logger import log_agent
from app.domain import replan
from app.services import mastery_log
from app.services.progress_data import local_date, topics_with_progress

AGENT = "study_planner"


def planning_topics(user_id: int):
    """Topics with the mastery the plan should use: what is left after forgetting, so stale topics are planned as the weak ones they have become."""
    topics = topics_with_progress(user_id)
    stored = {r["topic_id"]: r for r in db.query("SELECT topic_id, mastery_score, last_updated FROM learner_mastery WHERE user_id = ?", (user_id,))}
    rows = [{"topic_id": t["topic_id"], "mastery_score": t["mastery"], "last_updated": (stored.get(t["topic_id"]) or {}).get("last_updated")} for t in topics]
    faded = {r["topic_id"]: r["mastery_score"] for r in mastery_log.faded_rows(user_id, rows, _today())}
    return [{**t, "mastery": faded.get(t["topic_id"], t["mastery"])} for t in topics]


def _today() -> date:
    from app.services.progress_data import local_today
    return local_today()


def studied_days(user_id: int) -> set:
    """{(iso date, topic_id)}: every topic the student worked on, on which of their own calendar days."""
    queries = (
        "SELECT topic_id, answered_at AS t FROM quiz_attempts WHERE user_id = ?",
        "SELECT topic_id, at AS t FROM mastery_events WHERE user_id = ?",
        "SELECT topic_id, started_at AS t FROM voice_sessions WHERE user_id = ? AND turns > 0 AND topic_id IS NOT NULL",
        "SELECT topic_id, reviewed_at AS t FROM flashcards WHERE user_id = ? AND reviewed_at IS NOT NULL",
    )
    found = set()
    for sql in queries:
        for row in db.query(sql, (user_id,)):
            when = local_date(row["t"])
            if when and row["topic_id"] is not None:
                found.add((when.isoformat(), row["topic_id"]))
    return found


def _load(user_id: int):
    row = db.one("SELECT plan_snapshot FROM users WHERE id = ?", (user_id,))
    try:
        return json.loads(row["plan_snapshot"]) if row and row["plan_snapshot"] else None
    except ValueError:
        return None


def _save(user_id: int, snapshot: dict) -> None:
    db.execute("UPDATE users SET plan_snapshot = ? WHERE id = ?", (json.dumps(snapshot), user_id))


def review(user_id: int, exam: date, minutes: int, today: date, plan: dict):
    """Look at yesterday's plan against what happened and keep today's. Returns the re-plan note {message, missed_days, moved} or None.

    ``plan`` is today's freshly built plan (planner.build_plan). Called whenever the plan is read, so the first open of a day does the work.
    """
    snapshot = _load(user_id)
    days = plan["days"]
    fresh = {"built_on": today.isoformat(), "exam_date": exam.isoformat(), "minutes": minutes, "days": days, "note": None}

    if snapshot is None or snapshot.get("exam_date") != exam.isoformat() or snapshot.get("minutes") != minutes:
        _save(user_id, fresh)
        topics = len({i["topic_id"] for d in days for i in d["items"]})
        log_agent(user_id, AGENT, f"Exam on {exam.isoformat()}, {plan['days_left']} days left, {minutes} min a day",
                  "Built a plan from the weakest and fading topics" + ("; the earlier plan no longer fit" if snapshot else ""),
                  f"Planned {topics} topics over {len(days)} days", 0.85)
        return None

    built_on = date.fromisoformat(snapshot["built_on"])
    if built_on >= today:   # the same day: keep the note shown this morning, and keep the plan the student sees as the one to judge tomorrow by
        note = snapshot.get("note")
        if snapshot.get("days") != days:
            _save(user_id, {**snapshot, "days": days})
        return note

    missed = replan.missed_items(snapshot["days"], built_on, today, studied_days(user_id))
    note = replan.describe(missed, days, today)
    _save(user_id, {**fresh, "note": note})
    if note:
        log_agent(user_id, AGENT, f"{len(missed)} planned sessions over {note['missed_days']} days left no trace of study",
                  "Re-planned: " + note["message"], f"Rebuilt the plan from today ({len(days)} days to the exam)", 0.8)
    else:
        log_agent(user_id, AGENT, f"Every planned session since {built_on.isoformat()} was done or it was a rest day",
                  "Kept the plan on track", "Refreshed the plan with today's mastery", 0.9)
    return note
