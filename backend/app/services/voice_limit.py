"""The daily voice limit: voice is the main cost and uses the shared Gemini quota, so each student gets a set number of minutes a day. Typed Ask is not limited."""
from datetime import datetime, timezone

from app import db
from app.config import settings


def _when(value) -> datetime:
    """A stored timestamp as UTC. SQLite gives "YYYY-MM-DD HH:MM:SS"; Postgres may add a T or a zone."""
    return datetime.fromisoformat(str(value)[:19].replace("T", " ")).replace(tzinfo=timezone.utc)


def minutes_today(user_id: int, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    total = 0.0
    for row in db.query("SELECT started_at, ended_at FROM voice_sessions WHERE user_id = ? AND ended_at IS NOT NULL", (user_id,)):
        start, end = _when(row["started_at"]), _when(row["ended_at"])
        if end > midnight:
            total += (end - max(start, midnight)).total_seconds() / 60
    return total


def reached(user_id: int, now: datetime | None = None) -> bool:
    """The shared demo student is the fallback when a private guest cannot be made: everyone would share one limit, so it has none."""
    if user_id == settings.demo_user_id:
        return False
    return minutes_today(user_id, now) >= settings.daily_voice_minutes
