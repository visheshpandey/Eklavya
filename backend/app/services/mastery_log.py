"""The mastery history: every piece of evidence that moved a topic (a quiz or voice answer, a flashcard rating, a viva mark), with the change it made.
It is what the "Precision 38% -> 46%" message, the sparkline on Progress and the "started / not started" state are built from."""
from app import db
from app.domain import mastery as math_

SOURCES = ("quiz", "voice", "flashcard", "viva", "debate", "demo")


def current(user_id: int, topic_id: int) -> float:
    row = db.one("SELECT mastery_score FROM learner_mastery WHERE user_id = ? AND topic_id = ?", (user_id, topic_id))
    return row["mastery_score"] if row else 50.0


def started(user_id: int, topic_id: int) -> bool:
    return bool(db.one("SELECT id FROM mastery_events WHERE user_id = ? AND topic_id = ? LIMIT 1", (user_id, topic_id))
                or db.one("SELECT id FROM quiz_attempts WHERE user_id = ? AND topic_id = ? LIMIT 1", (user_id, topic_id)))


def record(user_id: int, topic_id: int, source: str, before: float, after: float, at: str | None = None) -> dict:
    """Write one event and return {topic_id, topic, before, after, delta, source} for the screen."""
    if at:
        db.execute("INSERT INTO mastery_events (user_id, topic_id, source, mastery_before, mastery_after, delta, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                   (user_id, topic_id, source, before, after, round(after - before, 1), at))
    else:
        db.execute("INSERT INTO mastery_events (user_id, topic_id, source, mastery_before, mastery_after, delta) VALUES (?, ?, ?, ?, ?, ?)",
                   (user_id, topic_id, source, before, after, round(after - before, 1)))
    topic = db.one("SELECT topic_name FROM topics WHERE id = ?", (topic_id,))
    return {"topic_id": topic_id, "topic": topic["topic_name"] if topic else "", "before": before, "after": after,
            "delta": round(after - before, 1), "source": source}


def apply_card(user_id: int, topic_id: int, rating: str) -> dict:
    """A flashcard rating ('known' | 'hard' | 'again') moves its topic's mastery. Returns the change (see `record`)."""
    before = current(user_id, topic_id)
    after = math_.card_update(before, rating)
    db.execute("INSERT INTO learner_mastery (user_id, topic_id, mastery_score) VALUES (?, ?, ?) "
               "ON CONFLICT(user_id, topic_id) DO UPDATE SET mastery_score = excluded.mastery_score, last_updated = CURRENT_TIMESTAMP",
               (user_id, topic_id, after))
    return record(user_id, topic_id, "flashcard", before, after)


def history(user_id: int, limit_per_topic: int = 24) -> dict:
    """{topic_id: [{at, after, source}]}, oldest first: quiz attempts and recorded events together."""
    series: dict = {}
    rows = db.query("SELECT topic_id, answered_at AS at, mastery_after AS after, 'quiz' AS source FROM quiz_attempts WHERE user_id = ? "
                    "UNION ALL SELECT topic_id, at, mastery_after AS after, source FROM mastery_events WHERE user_id = ?", (user_id, user_id))
    for row in sorted(rows, key=lambda r: str(r["at"])):
        series.setdefault(row["topic_id"], []).append({"at": row["at"], "after": row["after"], "source": row["source"]})
    return {topic: points[-limit_per_topic:] for topic, points in series.items()}


def faded_rows(user_id: int, rows: list[dict], today) -> list[dict]:
    """Adds `started` and the faded `mastery_score` to dashboard rows (the stored score is untouched)."""
    from app.services.progress_data import local_date   # imported here: progress_data imports the db layer too

    events = {r["topic_id"]: r["n"] for r in db.query(
        "SELECT topic_id, COUNT(*) AS n FROM (SELECT topic_id FROM mastery_events WHERE user_id = ? UNION ALL "
        "SELECT topic_id FROM quiz_attempts WHERE user_id = ?) x GROUP BY topic_id", (user_id, user_id))}
    out = []
    for row in rows:
        n = events.get(row["topic_id"], 0)
        changed = local_date(row.get("last_updated"))
        days = (today - changed).days if changed else 0
        shown = math_.faded(row["mastery_score"], days, n) if n else row["mastery_score"]
        out.append({**row, "started": n > 0, "evidence": n, "mastery_stored": row["mastery_score"], "mastery_score": shown})
    return out
