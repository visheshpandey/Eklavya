"""Ask: a question the notes do not cover is answered from general knowledge, labelled so, with no citation, and logged that way."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts
from app.agents import logger, voice_tutor
from main import app  # noqa: F401
from tests.test_live import client


@pytest.fixture
def guest():
    headers = {"Authorization": f"Bearer {client.post('/api/guest').json()['token']}"}
    client.post("/api/demo/seed", headers=headers)
    user_id = client.get("/api/auth/me", headers=headers).json()["id"]
    yield user_id, headers
    accounts.erase_user(user_id)


def _last_action(user_id):
    return logger.recent(user_id, 1)[0]["action_taken"]


def test_the_model_saying_it_did_not_use_the_notes_makes_a_general_answer(guest, monkeypatch):
    user_id, headers = guest
    monkeypatch.setattr(voice_tutor, "llm_json", lambda *a, **k: {
        "answer": "Kolkata Knight Riders won IPL 2024.", "follow_up_question": "Any study doubt?", "source_topic": "Precision", "used_notes": False})
    out = client.post("/api/tutor/ask", headers=headers, json={"question": "precision of who won IPL 2024", "language": "english"}).json()
    assert out["general"] is True and out["match"] == "general" and out["grounded"] is False
    assert out["sources"] == [] and out["source_topic"] is None and out["source_document"] is None
    assert _last_action(user_id) == "Answered from general knowledge"


def test_an_unrelated_question_is_general_even_when_search_returns_a_passage(guest, monkeypatch):
    """With embeddings, search always returns its nearest passages: one that shares no word with the question must not be cited."""
    user_id, headers = guest
    some = voice_tutor.search(user_id, "precision")
    monkeypatch.setattr(voice_tutor, "search", lambda *a, **k: some)
    monkeypatch.setattr(voice_tutor, "llm_json", lambda *a, **k: {"answer": "KKR.", "follow_up_question": "Ready to study?"})
    out = client.post("/api/tutor/ask", headers=headers, json={"question": "who won IPL 2024?", "language": "english"}).json()
    assert out["general"] is True and out["sources"] == []
    assert _last_action(user_id) == "Answered from general knowledge"


def test_an_answer_from_the_notes_still_cites_them(guest, monkeypatch):
    user_id, headers = guest
    monkeypatch.setattr(voice_tutor, "llm_json", lambda *a, **k: {
        "answer": "Precision is TP over TP plus FP.", "follow_up_question": "And recall?", "source_topic": "Precision", "used_notes": True})
    out = client.post("/api/tutor/ask", headers=headers, json={"question": "Explain precision", "language": "english"}).json()
    assert out["grounded"] is True and not out.get("general") and out["sources"]
    assert _last_action(user_id) == "Answered from notes"


@pytest.mark.parametrize("used,unrelated,outline,expected", [
    (False, False, False, True), (True, True, False, False), (None, True, False, True), (None, False, False, False), (False, True, True, False)])
def test_is_general(used, unrelated, outline, expected):
    assert voice_tutor.is_general(used, unrelated, outline) is expected


def test_a_too_long_question_gets_a_specific_message(guest):
    _, headers = guest
    res = client.post("/api/tutor/ask", headers=headers, json={"question": "x" * 2001, "language": "english"})
    assert res.status_code == 422
    assert res.json()["error"] == "Your question is too long. Please keep it under 2000 characters."


def test_other_bad_requests_keep_the_generic_message(guest):
    _, headers = guest
    res = client.post("/api/tutor/ask", headers=headers, json={"question": "hi", "document_id": "not a number"})
    assert res.status_code == 422 and res.json()["error"] == "The request was not valid."
