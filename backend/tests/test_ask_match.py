"""The label on an Ask answer: a question that names a topic exactly is a strong match; only genuinely weak ones are partial."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts
from app.domain import retrieval
from main import app  # noqa: F401
from tests.test_live import client

PRECISION = [{"heading": "Precision", "topic": "Precision", "text": "Precision is TP over TP plus FP. It looks only at what the model flagged."}]


@pytest.mark.parametrize("question", [
    "Explain Precision in simple words.",
    "Explain precision",
    "Describe precision in simple words",
    "Tell me about precision",
    "Define precision",
])
def test_naming_the_topic_covers_the_question_fully(question):
    assert retrieval.coverage(question, PRECISION) == 1.0


def test_instruction_words_alone_say_nothing_about_the_notes():
    assert retrieval.coverage("Explain it in simple words", PRECISION) == 0.0
    assert retrieval.coverage("What should I revise first?", PRECISION) == 0.0


def test_a_question_about_something_else_is_still_weak():
    assert retrieval.coverage("Explain photosynthesis and chlorophyll", PRECISION) == 0.0
    assert 0 < retrieval.coverage("Explain precision and photosynthesis", PRECISION) < 1.0


@pytest.fixture
def guest():
    headers = {"Authorization": f"Bearer {client.post('/api/guest').json()['token']}"}
    client.post("/api/demo/seed", headers=headers)
    yield headers
    accounts.erase_user(client.get("/api/auth/me", headers=headers).json()["id"])


@pytest.mark.parametrize("question,topic", [
    ("Explain Precision in simple words.", "Precision"),
    ("Explain Recall in simple words.", "Recall"),
    ("Explain Deadlocks in simple words.", "OS: Deadlocks"),
])
def test_the_suggestion_chips_get_from_your_notes(guest, question, topic):
    out = client.post("/api/tutor/ask", headers=guest, json={"question": question, "language": "english"}).json()
    assert out["match"] == "strong" and out["source_topic"] == topic


def test_a_question_the_notes_do_not_cover_is_not_strong(guest):
    out = client.post("/api/tutor/ask", headers=guest, json={"question": "what is a banana", "language": "english"}).json()
    assert out["match"] == "none"
