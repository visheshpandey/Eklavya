"""What the new screens need from the backend: Ask shows its sources, flashcards get a Hard rating and a reset, Today gives the week."""
from datetime import date, timedelta

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.agents import flashcards, voice_tutor
from app.domain import retrieval
from main import app  # noqa: F401  (creates the schema when this file runs on its own)
from tests.test_live import client


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "design@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}
    accounts.erase_user(made["user"]["id"])


def notes(user_id, text="Gradient descent moves the parameters a small step against the gradient of the loss."):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'ml.txt')", (user_id,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Gradient descent')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, 'Gradient descent', ?)", (doc, topic, text))
    return doc, topic


def test_coverage_is_the_share_of_the_questions_words_the_passages_contain():
    chunk = [{"heading": "Learning rate", "text": "A large learning rate makes updates overshoot the minimum."}]
    assert retrieval.coverage("what does a large learning rate do", chunk) == 1.0
    assert 0 < retrieval.coverage("learning rate and momentum", chunk) < 1.0
    assert retrieval.coverage("kya hai", chunk) == 0.0                      # only filler words
    assert retrieval.coverage("overshooting updates", chunk) == 1.0         # "overshooting" and "overshoot" are the same word


def test_ask_returns_the_passages_it_used_and_how_well_they_match(student, monkeypatch):
    user_id, headers = student
    notes(user_id)
    monkeypatch.setattr(voice_tutor, "llm_json", lambda *a, **k: {"answer": "It steps downhill.", "follow_up_question": "Why small steps?", "source_topic": "Gradient descent"})
    strong = client.post("/api/tutor/ask", headers=headers, json={"question": "explain gradient descent", "language": "english"}).json()
    assert strong["match"] == "strong" and strong["searched"] == 1 and strong["ms"] >= 0
    assert strong["sources"][0]["document"] == "ml.txt" and "gradient" in strong["terms"]
    partial = client.post("/api/tutor/ask", headers=headers, json={"question": "gradient descent and quantum entanglement", "language": "english"}).json()
    assert partial["match"] == "partial"
    none = client.post("/api/tutor/ask", headers=headers, json={"question": "photosynthesis", "language": "english"}).json()
    assert none["match"] == "none" and none["sources"] == [] and none["grounded"] is False and none["searched"] == 1


def test_ask_falls_back_to_the_notes_when_gemini_is_busy(student, monkeypatch):
    from app.errors import LLMError
    user_id, headers = student
    notes(user_id)

    def busy(*a, **k):
        raise LLMError("quota")
    monkeypatch.setattr(voice_tutor, "llm_json", busy)
    res = client.post("/api/tutor/ask", headers=headers, json={"question": "explain gradient descent", "language": "english"})
    assert res.status_code == 200
    out = res.json()
    assert out["fallback"] is True and out["grounded"] is True and "your notes say" in out["answer"]
    assert out["sources"] and out["sources"][0]["document"] == "ml.txt"   # still cites the passage


def test_hard_steps_a_card_back_one_box_again_resets_and_got_it_moves_up():
    assert flashcards.next_box(3, knew=True) == 4
    assert flashcards.next_box(3, knew=False) == 0
    assert flashcards.next_box(3, knew=False, hard=True) == 2
    assert flashcards.next_box(0, knew=False, hard=True) == 0
    assert flashcards.next_box(5, knew=True) == 5


def test_review_with_hard_and_reset_deck_over_http(student):
    user_id, headers = student
    _, topic = notes(user_id)
    card = db.execute("INSERT INTO flashcards (user_id, topic_id, front, back, box) VALUES (?, ?, 'f', 'b', 3)", (user_id, topic))
    hard = client.post(f"/api/flashcards/{card}/review", headers=headers, json={"knew": False, "hard": True}).json()
    assert hard["box"] == 2
    ok = client.post(f"/api/flashcards/{card}/review", headers=headers, json={"knew": True}).json()
    assert ok["box"] == 3 and ok["due_count"] == 0
    reset = client.post("/api/flashcards/reset", headers=headers).json()
    assert reset["due_count"] == 1
    assert db.one("SELECT box FROM flashcards WHERE id = ?", (card,))["box"] == 0


def test_today_reports_the_last_seven_days_for_the_streak_card(student):
    user_id, headers = student
    notes(user_id)
    empty = client.get("/api/today", headers=headers).json()
    assert empty["week"] == [False] * 7 and empty["cards_total"] == 0
    doc_topic = db.one("SELECT t.id FROM topics t JOIN documents d ON d.id = t.document_id WHERE d.user_id = ?", (user_id,))["id"]
    db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question, student_answer, is_correct) VALUES (?, ?, 'q', 'A', 1)", (user_id, doc_topic))
    studied = client.get("/api/today", headers=headers).json()
    assert studied["week"][-1] is True and studied["week"][:-1] == [False] * 6      # today is the last dot
    assert studied["streak"] == 1
