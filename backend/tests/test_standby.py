"""WS /ws/voice?standby=1: the page pre-connects when the Study room opens; the real settings arrive later with {"type": "start"}."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts
from main import app  # noqa: F401
from tests.test_live import client


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "standby@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], made["token"]
    accounts.erase_user(made["user"]["id"])


def test_a_standby_socket_is_ready_at_once_and_ignores_pings(student):
    _, token = student
    with client.websocket_connect(f"/ws/voice?token={token}&standby=1") as ws:
        assert ws.receive_json() == {"type": "standby"}
        ws.send_json({"type": "ping"})      # keeps the connection alive: not a start, not an error
        ws.send_json({"type": "ping"})
        # leaving without "start" just closes: no session, no Gemini call, no minutes used
    from app import db
    assert db.one("SELECT COUNT(*) AS n FROM voice_sessions WHERE user_id = ?", (student[0],))["n"] == 0


def test_start_uses_the_settings_it_carries_and_a_student_without_notes_is_told_so(student):
    _, token = student
    with client.websocket_connect(f"/ws/voice?token={token}&standby=1") as ws:
        assert ws.receive_json()["type"] == "standby"
        ws.send_json({"type": "start", "lang": "hinglish", "mode": "test", "topic_id": 999999, "tutor": "mentor"})
        event = ws.receive_json()
    assert event["type"] == "error" and event["code"] == "need_notes"   # the same checks as a normal connection, run when start arrives
