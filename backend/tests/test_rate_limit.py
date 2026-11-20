"""Per-minute limit on Gemini-backed calls: Ask, generation and voice starts answer a friendly 429 once a student goes too fast."""
from types import SimpleNamespace

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts
from app.agents import voice_tutor
from app.errors import RateLimitedError
from app.services import rate_limit
from main import app  # noqa: F401
from tests.test_live import client


def test_the_window_slides():
    for second in range(3):
        rate_limit.check("ask", "user:1", now=100.0 + second, limit=3)
    with pytest.raises(RateLimitedError) as caught:
        rate_limit.check("ask", "user:1", now=110.0, limit=3)
    assert caught.value.retry_after == 51 and "wait 51 seconds" in str(caught.value)
    rate_limit.check("ask", "user:2", now=110.0, limit=3)          # someone else is not affected
    rate_limit.check("generate", "user:1", now=110.0, limit=3)     # nor another kind of call
    rate_limit.check("ask", "user:1", now=160.5, limit=3)          # a minute after the first call there is room again


def test_zero_turns_it_off():
    for _ in range(100):
        rate_limit.check("ask", "user:1", limit=0)


@pytest.fixture
def guest(monkeypatch):
    monkeypatch.setattr(rate_limit, "settings", SimpleNamespace(rate_limit_per_minute=2))
    token = client.post("/api/guest").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/api/demo/seed", headers=headers)
    user_id = client.get("/api/auth/me", headers=headers).json()["id"]
    yield user_id, headers, token
    accounts.erase_user(user_id)


def test_ask_answers_429_with_a_friendly_message(guest, monkeypatch):
    _, headers, _ = guest
    monkeypatch.setattr(voice_tutor, "llm_json", lambda *a, **k: {"answer": "ok", "follow_up_question": "next?", "used_notes": True})
    ask = lambda: client.post("/api/tutor/ask", headers=headers, json={"question": "Explain precision", "language": "english"})  # noqa: E731
    assert ask().status_code == 200 and ask().status_code == 200
    third = ask()
    assert third.status_code == 429 and third.json()["code"] == "rate_limited"
    assert third.json()["error"].startswith("You are going a little fast.") and int(third.headers["retry-after"]) >= 1


def test_generation_routes_are_limited(guest):
    _, headers, _ = guest
    for _ in range(2):
        rate_limit.check("generate", f"user:{client.get('/api/auth/me', headers=headers).json()['id']}")
    for path, body in [("/api/quiz/generate", {"topic_id": 1}), ("/api/flashcards/generate", {"topic_id": 1}), ("/api/mock-exam/start", {})]:
        assert client.post(path, headers=headers, json=body).status_code == 429, path


def test_starting_a_voice_session_is_limited(guest):
    user_id, _, token = guest
    for _ in range(2):
        rate_limit.check("voice", f"user:{user_id}")
    with client.websocket_connect(f"/ws/voice?token={token}") as ws:
        event = ws.receive_json()
    assert event["type"] == "error" and event["code"] == "rate_limited"
