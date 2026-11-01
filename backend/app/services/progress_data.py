"""Shared reads for the Today, revision and planner screens: topics with mastery, when each was last practised,
and the days the student studied. The database stores UTC; dates are turned into the student's own calendar days.

Whose calendar: the browser sends its timezone with every request (header X-Timezone, see app.main), and that is used for the
whole request. Without it (a scheduled job, an old client) the APP_TIMEZONE setting is used, India Standard Time by default.
The server's own clock zone is never used: on a hosted server it is UTC, which puts "today" 5.5 hours off for a student in India.
"""
from contextvars import ContextVar
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app import db
from app.config import settings

_request_zone: ContextVar = ContextVar("request_zone", default=None)


def use_timezone(name: str | None) -> None:
    """Make ``name`` (an IANA zone such as "Asia/Kolkata") the student's calendar for the rest of this request; unknown names are ignored."""
    try:
        _request_zone.set(ZoneInfo(name) if name else None)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        _request_zone.set(None)


def current_zone() -> ZoneInfo:
    return _request_zone.get() or ZoneInfo(settings.timezone)


def local_date(timestamp: str | None) -> date | None:
    """A SQLite CURRENT_TIMESTAMP (UTC, "YYYY-MM-DD HH:MM:SS") as a local calendar date."""
    if not timestamp:
        return None
    try:
        moment = datetime.fromisoformat(timestamp.replace(" ", "T"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(current_zone()).date()


def local_today() -> date:
    return datetime.now(current_zone()).date()


def topics_with_progress(user_id: int):
    """[{topic_id, topic_name, document_id, mastery, last_practised: date | None}] for every topic of the student."""
    rows = db.query(
        "SELECT t.id AS topic_id, t.topic_name, t.document_id, COALESCE(m.mastery_score, 50) AS mastery, "
        "(SELECT MAX(a.answered_at) FROM quiz_attempts a WHERE a.user_id = d.user_id AND a.topic_id = t.id) AS last_answer "
        "FROM topics t JOIN documents d ON d.id = t.document_id "
        "LEFT JOIN learner_mastery m ON m.topic_id = t.id AND m.user_id = d.user_id "
        "WHERE d.user_id = ? ORDER BY d.id, t.id", (user_id,))
    return [{"topic_id": r["topic_id"], "topic_name": r["topic_name"], "document_id": r["document_id"],
             "mastery": r["mastery"], "last_practised": local_date(r["last_answer"])} for r in rows]


def active_days(user_id: int) -> set:
    """Local days on which the student answered a question or talked to the tutor."""
    stamps = [r["t"] for r in db.query("SELECT answered_at AS t FROM quiz_attempts WHERE user_id = ?", (user_id,))]
    stamps += [r["t"] for r in db.query("SELECT started_at AS t FROM voice_sessions WHERE user_id = ? AND turns > 0", (user_id,))]
    stamps += [r["t"] for r in db.query("SELECT reviewed_at AS t FROM flashcards WHERE user_id = ? AND reviewed_at IS NOT NULL", (user_id,))]
    return {d for d in (local_date(s) for s in stamps) if d}
