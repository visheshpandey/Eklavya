"""The daily voice limit: counted per student and per day, told plainly, and never applied to the shared demo fallback."""
from datetime import datetime, timedelta, timezone

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.config import settings
from app.services import voice_limit
from main import app  # noqa: F401
from tests.test_live import client

NOON = datetime(2026, 12, 3, 12, 0, tzinfo=timezone.utc)


def stamp(moment):
    return moment.strftime("%Y-%m-%d %H:%M:%S")


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "voicelimit@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], made["token"]
    accounts.erase_user(made["user"]["id"])


def add_call(user_id, start, minutes):
    db.execute("INSERT INTO voice_sessions (user_id, started_at, ended_at) VALUES (?, ?, ?)", (user_id, stamp(start), stamp(start + timedelta(minutes=minutes))))


def test_only_todays_minutes_count(student):
    user_id, _ = student
    add_call(user_id, NOON - timedelta(hours=2), 5)
    add_call(user_id, NOON - timedelta(days=1), 30)
    add_call(user_id, NOON.replace(hour=0) - timedelta(minutes=2), 6)   # crosses midnight: 4 minutes are today's
    assert voice_limit.minutes_today(user_id, NOON) == pytest.approx(9)


def test_the_limit_is_reached_at_the_set_minutes(student):
    user_id, _ = student
    add_call(user_id, NOON - timedelta(hours=1), settings.daily_voice_minutes - 1)
    assert not voice_limit.reached(user_id, NOON)
    add_call(user_id, NOON - timedelta(minutes=30), 1)
    assert voice_limit.reached(user_id, NOON)


def test_a_call_over_the_limit_is_told_so(student):
    user_id, token = student
    add_call(user_id, datetime.now(timezone.utc) - timedelta(minutes=settings.daily_voice_minutes + 1), settings.daily_voice_minutes)
    if voice_limit.minutes_today(user_id) < settings.daily_voice_minutes:
        pytest.skip("just after midnight UTC")
    with client.websocket_connect(f"/ws/voice?token={token}") as ws:
        event = ws.receive_json()
    assert event["type"] == "error" and event["code"] == "daily_limit" and event["retryable"] is False


def test_the_shared_demo_student_has_no_limit():
    add_call(settings.demo_user_id, NOON - timedelta(hours=3), settings.daily_voice_minutes + 60)
    assert not voice_limit.reached(settings.demo_user_id, NOON)
    db.execute("DELETE FROM voice_sessions WHERE user_id = ? AND started_at = ?", (settings.demo_user_id, stamp(NOON - timedelta(hours=3))))
