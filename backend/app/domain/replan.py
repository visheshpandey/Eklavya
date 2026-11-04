"""Re-planning (pure): which planned sessions were missed, and what to tell the student when the plan is rebuilt.

The plan itself comes from planner.build_plan. This module only decides, from the plan the student was shown earlier
(a "snapshot") and the days they actually studied, whether a session was missed, and words the change in one short line.
"""
from datetime import date, timedelta

MAX_NAMED = 3   # topics named in the message; the rest are counted


def missed_items(snapshot_days, since: date, today: date, done) -> list:
    """Sessions planned for a day from ``since`` up to yesterday that left no trace.

    ``snapshot_days``: [{date: "YYYY-MM-DD", items: [{topic_id, topic, kind, minutes}]}].
    ``done``: a set of (iso date, topic_id): a topic the student studied on that day (answered, rated a card, talked about it).
    Returns [{date, topic_id, topic, kind}] oldest first. A day with no items (a rest day) is never missed.
    """
    out = []
    for day in snapshot_days:
        when = date.fromisoformat(day["date"])
        if not (since <= when < today):
            continue
        for item in day["items"]:
            if (day["date"], item["topic_id"]) not in done:
                out.append({"date": day["date"], "topic_id": item["topic_id"], "topic": item["topic"], "kind": item["kind"]})
    return out


def short_name(topic: str) -> str:
    """"OS: Paging" -> "Paging" (the subject prefix is noise in a sentence)."""
    return topic.split(": ", 1)[1] if ": " in topic else topic


def _join(names) -> str:
    """["A"] -> "A"; ["A", "B"] -> "A and B"; ["A", "B", "C"] -> "A, B and C"."""
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def day_name(iso: str, today: date) -> str:
    when = date.fromisoformat(iso)
    if when == today:
        return "today"
    if when == today + timedelta(days=1):
        return "tomorrow"
    return when.strftime("%A")


def describe(missed, new_days, today: date) -> dict:
    """The change as {message, missed_days, moved: [{topic_id, topic, date}]}, or None when nothing was missed.

    A missed topic counts as moved to the first day from today on that holds it in the rebuilt plan; one that no longer
    appears is left out of the sentence (the plan is full: the weaker topics came first).
    """
    if not missed:
        return None
    missed_days = len({m["date"] for m in missed})
    where = {}
    for day in new_days:
        if date.fromisoformat(day["date"]) < today:
            continue
        for item in day["items"]:
            where.setdefault(item["topic_id"], day["date"])
    moved, seen = [], set()
    for m in missed:
        if m["topic_id"] in seen or m["topic_id"] not in where:
            continue
        seen.add(m["topic_id"])
        moved.append({"topic_id": m["topic_id"], "topic": short_name(m["topic"]), "date": where[m["topic_id"]]})
    lead = f"You missed {missed_days} day{'s' if missed_days != 1 else ''}"
    if not moved:
        return {"message": f"{lead}; I rebuilt your plan around what needs you most now.", "missed_days": missed_days, "moved": []}
    named = moved[:MAX_NAMED]
    by_day = {}
    for m in named:   # topics that land on the same day are named together: "A and B to today, C to tomorrow"
        by_day.setdefault(m["date"], []).append(m["topic"])
    what = "I moved " + ", ".join(f"{_join(names)} to {day_name(iso, today)}" for iso, names in by_day.items())
    rest = len(moved) - len(named)
    if rest:
        what += f", and {rest} more topic{'s' if rest != 1 else ''} back into your plan"
    return {"message": f"{lead}; {what}.", "missed_days": missed_days, "moved": moved}
