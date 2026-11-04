"""What the app really did, for the "Behind the scenes" panel. Nothing here is invented: it counts what happened.

* Gemini calls, failures and Ask fallbacks are counted in memory, **since the server last started** (they reset on a restart or a Render sleep),
  so the panel says "since the server started". They are numbers only, shared by everyone, and carry no content.
* How long each Ask took is stored per student in the ``ask_timings`` table, so the numbers shown are that student's own.
"""
import threading

from app import db

_lock = threading.Lock()
_counts = {"gemini_calls": 0, "gemini_failed": 0, "ask_fallbacks": 0}


def count(name: str) -> None:
    with _lock:
        _counts[name] += 1


def counts() -> dict:
    with _lock:
        return dict(_counts)


def reset() -> None:   # tests
    with _lock:
        for key in _counts:
            _counts[key] = 0


def record_ask(user_id: int, ms: int, fallback: bool) -> None:
    """One finished Ask: how long it took in total (search plus Gemini), and whether it fell back to the notes."""
    db.execute("INSERT INTO ask_timings (user_id, ms, fallback) VALUES (?, ?, ?)", (user_id, int(ms), int(bool(fallback))))
    if fallback:
        count("ask_fallbacks")


def ask_summary(user_id: int, last: int = 10) -> dict:
    rows = db.query("SELECT ms, fallback FROM ask_timings WHERE user_id = ? ORDER BY id DESC LIMIT ?", (user_id, last))
    if not rows:
        return {"answered": 0, "average_ms": None, "recent_ms": [], "fallbacks": 0}
    times = [row["ms"] for row in rows]
    return {"answered": db.one("SELECT COUNT(*) AS n FROM ask_timings WHERE user_id = ?", (user_id,))["n"],
            "average_ms": round(sum(times) / len(times)), "recent_ms": times, "fallbacks": sum(1 for row in rows if row["fallback"])}


def report(user_id: int, decisions: int = 12) -> dict:
    from app.agents import logger   # imported here: logger is an agent module and this service is imported by agents
    return {"decisions": logger.recent(user_id, decisions), "gemini": counts(), "ask": ask_summary(user_id)}
