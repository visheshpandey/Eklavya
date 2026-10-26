"""Spaced revision (pure): when a practised topic should come back, before it is forgotten.

The weaker the topic, the sooner it returns. Intervals roughly follow a forgetting curve:
1 day for shaky topics, up to 2 weeks for mastered ones.
"""
from datetime import date, timedelta

# (mastery below this, revise again after this many days)
INTERVALS = ((40, 1), (60, 2), (75, 4), (90, 7))
MASTERED_INTERVAL = 14


def interval_days(mastery: float) -> int:
    for limit, days in INTERVALS:
        if mastery < limit:
            return days
    return MASTERED_INTERVAL


def next_review(last_practised: date, mastery: float) -> date:
    return last_practised + timedelta(days=interval_days(mastery))


def due_topics(topics, today: date):
    """Topics whose review date has come, most overdue first, then weakest.

    ``topics``: [{topic_id, topic_name, mastery, last_practised: date | None}]. Never-practised topics are
    not "due"; they are new and show up in the plan as something to learn.
    """
    due = []
    for t in topics:
        if t.get("last_practised") is None:
            continue
        review = next_review(t["last_practised"], t["mastery"])
        if review <= today:
            due.append({**t, "review_date": review, "overdue_days": (today - review).days})
    return sorted(due, key=lambda t: (-t["overdue_days"], t["mastery"]))
