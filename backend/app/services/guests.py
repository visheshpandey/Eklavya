"""Private guests: each browser that picks the demo gets its own anonymous student, so one visitor's notes never appear for the next."""
from datetime import datetime, timedelta, timezone

from app import accounts, auth, db

KEEP_DAYS = 7


def create(ip: str) -> dict:
    accounts.check_limit("guest-ip", ip)
    user_id = db.execute("INSERT INTO users (name, guest_since) VALUES ('Guest', ?)", (datetime.now(timezone.utc).isoformat(),))
    return {"token": auth.make_token(user_id)}


def purge_old(now: datetime | None = None) -> int:
    """Remove guests older than KEEP_DAYS. Their feedback stays, without a name on it: it is the evidence that the app helps."""
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(days=KEEP_DAYS)).isoformat()
    old = db.query("SELECT id FROM users WHERE guest_since IS NOT NULL AND guest_since < ?", (cutoff,))
    for row in old:
        db.execute("UPDATE feedback SET user_id = NULL WHERE user_id = ?", (row["id"],))
        accounts.erase_user(row["id"])
    return len(old)
