"""Numbers for the live dashboard (GET /api/live): what the app has really done, counted from the database.

Nothing personal leaves here. Students are shown as "Student #id", questions and answers are never included (only the topic),
and every number is a count or a time. Timestamps are stored as UTC text ("YYYY-MM-DD HH:MM:SS"), so they sort and compare as text.
"""
from datetime import datetime, timedelta, timezone

from app import db
from app.services import usage

ACTIVE_WINDOW_MIN = 5     # "active now" means any activity in the last five minutes
SERIES_MINUTES = 30       # the activity chart: one bar per minute
FEED_SIZE = 14
STAMP = "%Y-%m-%d %H:%M:%S"

TOTALS = {"students": "users", "notes": "documents", "questions": "doubts", "quiz_answers": "quiz_attempts",
          "flashcards": "flashcards", "voice_sessions": "voice_sessions", "mock_exams": "mock_exams", "groups": "study_groups"}

# (event kind, table, time column, extra columns shown in the feed)
EVENTS = (("ask", "doubts", "created_at", "topic"), ("quiz", "quiz_attempts", "answered_at", "is_correct"),
          ("voice", "voice_sessions", "started_at", "mode"), ("notes", "documents", "uploaded_at", "file_name"),
          ("cards", "flashcards", "created_at", "front"), ("exam", "mock_exams", "started_at", "total"))


def _stamp(moment: datetime) -> str:
    return moment.strftime(STAMP)


def _parse(text) -> datetime | None:
    try:
        return datetime.strptime(str(text)[:19], STAMP).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def describe(kind: str, extra) -> str:
    """One feed line, without any personal text: a question shows its topic, never the words the student typed."""
    if kind == "ask":
        return f"asked a question about {extra}" if extra else "asked a general question"
    if kind == "quiz":
        return "answered a quiz question correctly" if extra else "answered a quiz question"
    if kind == "voice":
        return f"started a voice session ({extra})" if extra else "started a voice session"
    if kind == "notes":
        return "added study notes"
    if kind == "cards":
        return "made flashcards"
    return "started a mock exam"


def minute_buckets(times: list, now: datetime, minutes: int = SERIES_MINUTES) -> list:
    """How many events fell in each of the last `minutes` minutes, oldest first (pure)."""
    counts = [0] * minutes
    for moment in times:
        ago = int((now - moment).total_seconds() // 60)
        if 0 <= ago < minutes:
            counts[minutes - 1 - ago] += 1
    return counts


def _voice_minutes() -> int:
    total = 0.0
    for row in db.query("SELECT started_at, ended_at FROM voice_sessions WHERE ended_at IS NOT NULL"):
        start, end = _parse(row["started_at"]), _parse(row["ended_at"])
        if start and end and end > start:
            total += (end - start).total_seconds() / 60
    return round(total)


def snapshot(now: datetime = None) -> dict:
    now = now or datetime.now(timezone.utc)
    since = _stamp(now - timedelta(minutes=SERIES_MINUTES))
    today = _stamp(now.replace(hour=0, minute=0, second=0, microsecond=0))
    active_since = _stamp(now - timedelta(minutes=ACTIVE_WINDOW_MIN))
    feed, recent, active, today_count = [], [], set(), 0
    for kind, table, column, extra in EVENTS:
        for row in db.query(f"SELECT user_id, {column} AS at, {extra} AS extra FROM {table} WHERE {column} >= ? ORDER BY {column} DESC LIMIT 400", (min(today, since),)):
            moment = _parse(row["at"])
            if not moment:
                continue
            today_count += row["at"] >= today
            if row["at"] >= since:
                recent.append(moment)
            if row["at"] >= active_since and row["user_id"] is not None:
                active.add(row["user_id"])
            feed.append({"at": row["at"], "kind": kind, "who": f"Student #{row['user_id']}", "what": describe(kind, row["extra"] if kind in ("ask", "quiz", "voice") else None)})
    feed.sort(key=lambda event: event["at"], reverse=True)
    totals = {name: db.one(f"SELECT COUNT(*) AS n FROM {table}")["n"] for name, table in TOTALS.items()}
    asks = db.one("SELECT COUNT(*) AS n, AVG(ms) AS avg FROM ask_timings")
    return {"as_of": _stamp(now), "totals": totals, "today": today_count, "active_now": len(active),
            "voice_minutes": _voice_minutes(), "activity": minute_buckets(recent, now),
            "ask": {"answered": asks["n"], "average_ms": round(asks["avg"]) if asks["avg"] else None},
            "gemini": usage.counts(), "feed": feed[:FEED_SIZE]}
