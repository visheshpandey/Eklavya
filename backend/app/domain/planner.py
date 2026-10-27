"""Exam-date planner (pure): a day-by-day plan from today to the exam.

Weak topics get more sessions, spread out over the days (spacing helps memory); the last day before the
exam is a light full revision. Each session is SESSION_MINUTES long.
"""
import math
from datetime import date, timedelta

SESSION_MINUTES = 15
FINAL_REVIEW_MINUTES = 10   # each topic in the last-day revision
TARGET_MASTERY = 85        # aim for this before the exam
GAIN_PER_SESSION = 12      # rough mastery gained by one focused session
MAX_SESSIONS_PER_TOPIC = 4
MAX_DAYS = 60


def sessions_needed(mastery: float) -> int:
    if mastery >= TARGET_MASTERY:
        return 1           # a quick review only
    return min(MAX_SESSIONS_PER_TOPIC, max(1, math.ceil((TARGET_MASTERY - mastery) / GAIN_PER_SESSION)))


def build_plan(topics, today: date, exam_date: date, minutes_per_day: int = 30):
    """``topics``: [{topic_id, topic_name, mastery}]. Returns {days_left, days: [{date, items: [...]}]}.

    Items: {topic_id, topic, kind: learn | test | revise, minutes}. A day never holds more than ``minutes_per_day`` of
    work; ``unscheduled`` counts sessions that did not fit. Raises ValueError for an exam date that is not after today.
    """
    days_left = (exam_date - today).days
    if days_left < 1:
        raise ValueError("Pick an exam date after today.")
    study_days = min(days_left, MAX_DAYS)
    dates = [today + timedelta(days=i) for i in range(study_days)]
    per_day = max(1, minutes_per_day // SESSION_MINUTES)
    final_review = study_days >= 3                       # keep the last day for a full revision
    working = dates[:-1] if final_review else dates
    load = {d: [] for d in dates}
    unscheduled = 0

    for t in sorted(topics, key=lambda t: t["mastery"]):
        count = sessions_needed(t["mastery"])
        for n in range(count):
            target = min(len(working) - 1, round(n * len(working) / count))   # spread the sessions out
            # the first day at or after the target with room (then wrap around). When every day is full the session is
            # left out (weakest topics are scheduled first, so the strongest lose out): a plan must fit the daily minutes
            order = list(range(target, len(working))) + list(range(0, target))
            day = next((working[i] for i in order if len(load[working[i]]) < per_day), None)
            if day is None:
                unscheduled += 1
                continue
            if n == 0 and t["mastery"] < 60:
                kind = "learn"
            elif t["mastery"] >= TARGET_MASTERY:
                kind = "revise"
            else:
                kind = "test"
            load[day].append({"topic_id": t["topic_id"], "topic": t["topic_name"], "kind": kind, "minutes": SESSION_MINUTES})

    if final_review:
        weakest = sorted(topics, key=lambda t: t["mastery"])[: max(1, minutes_per_day // FINAL_REVIEW_MINUTES)]   # fits the budget
        load[dates[-1]] = [{"topic_id": t["topic_id"], "topic": t["topic_name"], "kind": "revise", "minutes": FINAL_REVIEW_MINUTES}
                           for t in weakest]
    return {"days_left": days_left, "unscheduled": unscheduled,
            "days": [{"date": d.isoformat(), "items": sorted(load[d], key=lambda i: i["kind"] != "learn")} for d in dates]}
