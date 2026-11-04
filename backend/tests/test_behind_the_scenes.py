"""Behind the scenes: real counts only, per student, and honest when there is nothing yet."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.agents import voice_tutor
from app.ai import gemini
from app.errors import LLMError
from app.services import usage
from main import app  # noqa: F401
from tests.test_live import client


def make(n):
    made = client.post("/api/auth/signup", json={"email": f"bts{n}@example.com", "password": "longenough1"}).json()
    return made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}


@pytest.fixture(autouse=True)
def fresh():
    usage.reset()
    yield
    usage.reset()


def add_notes(user_id):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'ml.txt')", (user_id,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Gradient descent')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, 'Gradient descent', ?)",
               (doc, topic, "Gradient descent moves the parameters a small step against the gradient of the loss, again and again until it settles."))


def test_a_new_student_sees_honest_zeros():
    user_id, headers = make(1)
    try:
        data = client.get("/api/behind-the-scenes", headers=headers).json()
        assert data["decisions"] == []
        assert data["ask"] == {"answered": 0, "average_ms": None, "recent_ms": [], "fallbacks": 0}
        assert data["gemini"] == {"gemini_calls": 0, "gemini_failed": 0, "ask_fallbacks": 0}
    finally:
        accounts.erase_user(user_id)


def test_an_ask_is_timed_and_shows_up_for_that_student_only(monkeypatch):
    one, h1 = make(2)
    two, h2 = make(3)
    try:
        add_notes(one)
        monkeypatch.setattr(voice_tutor, "llm_json", lambda *a, **k: {"answer": "Small steps downhill.", "follow_up_question": "Why small?", "source_topic": "Gradient descent"})
        assert client.post("/api/tutor/ask", headers=h1, json={"question": "explain gradient descent", "language": "english"}).status_code == 200
        mine = client.get("/api/behind-the-scenes", headers=h1).json()
        assert mine["ask"]["answered"] == 1 and mine["ask"]["average_ms"] >= 0 and len(mine["ask"]["recent_ms"]) == 1
        assert mine["decisions"] and mine["decisions"][0]["agent_name"] == "voice_tutor"
        theirs = client.get("/api/behind-the-scenes", headers=h2).json()
        assert theirs["ask"]["answered"] == 0 and theirs["decisions"] == []   # one student's questions never show for another
    finally:
        accounts.erase_user(one)
        accounts.erase_user(two)


def test_a_fallback_answer_is_counted(monkeypatch):
    user_id, headers = make(4)
    try:
        add_notes(user_id)

        def busy(*a, **k):
            raise LLMError("quota")
        monkeypatch.setattr(voice_tutor, "llm_json", busy)
        assert client.post("/api/tutor/ask", headers=headers, json={"question": "explain gradient descent", "language": "english"}).json()["fallback"] is True
        data = client.get("/api/behind-the-scenes", headers=headers).json()
        assert data["ask"]["fallbacks"] == 1 and data["gemini"]["ask_fallbacks"] == 1
    finally:
        accounts.erase_user(user_id)


def test_gemini_calls_and_failures_are_counted_but_cached_answers_are_not(monkeypatch):
    class Reply:
        text = '{"ok": 1}'

    class Models:
        fail = False

        def generate_content(self, **kwargs):
            if Models.fail:
                raise RuntimeError("boom")
            return Reply()

    class Client:
        models = Models()

    monkeypatch.setattr(gemini, "_get_client", lambda: Client())
    monkeypatch.setattr(gemini, "RETRY_PAUSE_SECONDS", 0)
    gemini._cache.clear()
    assert gemini.call_llm_json("sys", "prompt one")["success"] is True
    assert gemini.call_llm_json("sys", "prompt one")["success"] is True   # served from the cache: no call
    assert usage.counts()["gemini_calls"] == 1 and usage.counts()["gemini_failed"] == 0
    Models.fail = True
    assert gemini.call_llm_json("sys", "prompt two")["success"] is False
    assert usage.counts()["gemini_failed"] == 1 and usage.counts()["gemini_calls"] == 2


def test_timings_are_removed_with_the_account(monkeypatch):
    user_id, _ = make(5)
    usage.record_ask(user_id, 1200, False)
    accounts.erase_user(user_id)
    assert db.one("SELECT COUNT(*) AS n FROM ask_timings WHERE user_id = ?", (user_id,))["n"] == 0
