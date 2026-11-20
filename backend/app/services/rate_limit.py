"""Per-minute limit on the calls that spend Gemini quota: Ask, quiz/flashcard/mock-exam generation and starting a voice session.

Each kind has its own sliding one-minute window of ``RATE_LIMIT_PER_MINUTE`` calls, kept per student (every browser has its own guest
login) or, for a call without a login, per network address. One server process, so memory is enough (as for the sign-in limits).
"""
import threading
import time
from collections import defaultdict, deque

from app.config import settings
from app.errors import RateLimitedError

WINDOW_SECONDS = 60
MESSAGE = "You are going a little fast. Please wait {wait} seconds and try again."

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def check(kind: str, who: str, now: float | None = None, limit: int | None = None) -> None:
    """Count one call of ``kind`` by ``who``; raise ``TooManyRequestsError`` (429) once the minute's limit is used up."""
    limit = settings.rate_limit_per_minute if limit is None else limit
    if limit <= 0:
        return
    now = time.monotonic() if now is None else now
    with _lock:
        hits = _hits[f"{kind}:{who}"]
        while hits and hits[0] <= now - WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            wait = max(1, int(hits[0] + WINDOW_SECONDS - now) + 1)
            raise RateLimitedError(MESSAGE.format(wait=wait), retry_after=wait)
        hits.append(now)


def reset() -> None:   # tests
    with _lock:
        _hits.clear()
