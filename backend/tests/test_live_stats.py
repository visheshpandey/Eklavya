"""The live dashboard: GET /api/live gives counts and a feed, never a student's name or the words they typed."""
from datetime import datetime, timedelta, timezone

import conftest  # noqa: F401  (isolated DB before the app is imported)
from fastapi.testclient import TestClient

from app import db, main as app_main
from app.services import live_stats

NOW = datetime(2026, 11, 24, 12, 0, 0, tzinfo=timezone.utc)


def _at(minutes_ago: float) -> str:
    return (NOW - timedelta(minutes=minutes_ago)).strftime(live_stats.STAMP)


def test_minute_buckets_count_each_minute_oldest_first():
    times = [NOW - timedelta(seconds=10), NOW - timedelta(seconds=30), NOW - timedelta(minutes=2, seconds=5), NOW - timedelta(minutes=40)]
    buckets = live_stats.minute_buckets(times, NOW, minutes=5)
    assert buckets == [0, 0, 1, 0, 2] and len(live_stats.minute_buckets([], NOW)) == live_stats.SERIES_MINUTES


def test_a_question_shows_its_topic_never_its_words():
    assert live_stats.describe("ask", "Normalization") == "asked a question about Normalization"
    assert live_stats.describe("ask", None) == "asked a general question"


def test_snapshot_counts_activity_and_hides_personal_text():
    user = db.execute("INSERT INTO users (name, email) VALUES (?, ?)", ("Priya Sharma", "priya@example.com"))
    db.execute("INSERT INTO doubts (user_id, question, answer, topic, grounded, created_at) VALUES (?, ?, ?, ?, ?, ?)",
               (user, "my secret question about my marks", "an answer", "Joins", 1, _at(1)))
    db.execute("INSERT INTO voice_sessions (user_id, started_at, ended_at, mode) VALUES (?, ?, ?, ?)", (user, _at(30), _at(20), "tutor"))
    snap = live_stats.snapshot(NOW)
    assert snap["totals"]["students"] >= 1 and snap["totals"]["questions"] >= 1
    assert snap["active_now"] >= 1 and snap["voice_minutes"] >= 10 and sum(snap["activity"]) >= 1
    feed = " ".join(f"{event['who']} {event['what']}" for event in snap["feed"])
    assert "Joins" in feed and f"Student #{user}" in feed
    assert "Priya" not in str(snap) and "secret question" not in str(snap) and "example.com" not in str(snap)


def test_endpoint_is_public_and_returns_the_snapshot():
    body = TestClient(app_main.create_app()).get("/api/live")
    assert body.status_code == 200
    assert {"totals", "today", "active_now", "activity", "feed", "voice_minutes", "ask", "gemini"} <= set(body.json())
