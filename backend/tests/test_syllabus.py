"""A syllabus (topics named, not explained): every listed item is a topic, and each one is still taught, from general knowledge, saying so."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.agents import document_intelligence as docs
from app.agents import voice_tutor
from app.domain.retrieval import is_outline
from main import app  # noqa: F401
from tests.test_live import client

SYLLABUS = ("UNIT I Introduction to operating systems and their main functions, System calls, Process concept, Threads. "
            "UNIT II CPU scheduling, FCFS, SJF, Round Robin, Priority, Deadlock, Bankers algorithm, Paging, Segmentation, Virtual memory")
NOTES = ("Round Robin gives each process a fixed time quantum. When the quantum ends, the process goes back to the end of the "
         "ready queue, so no process waits forever and response time stays low for interactive work.")


@pytest.mark.parametrize("text,expected", [
    (SYLLABUS, True),
    ("Unit 2: CPU Scheduling - FCFS, SJF, Priority, Round Robin", True),
    ("Paging", True),
    (NOTES, False),
])
def test_a_syllabus_is_told_apart_from_notes(text, expected):
    assert is_outline([{"text": text}]) is expected


def test_no_passages_count_as_nothing_to_teach_from():
    assert is_outline([]) is True


def test_the_topic_prompt_keeps_every_listed_item_even_one_word(monkeypatch):
    seen = {}

    def fake(system, prompt, **kwargs):
        seen["prompt"] = prompt
        return {"topics": ["OS: Paging", "OS: Deadlock"]}
    monkeypatch.setattr(docs, "llm_json", fake)
    assert docs._llm_topics(SYLLABUS) == ["OS: Paging", "OS: Deadlock"]
    assert "keep EVERY listed topic" in seen["prompt"] and "even a single word" in seen["prompt"]
    assert docs.MAX_TOPICS >= 60


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "syllabus@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}
    accounts.erase_user(made["user"]["id"])


def _add(user_id, text):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'os-syllabus.txt')", (user_id,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Paging')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, '', ?)", (doc, topic, text))


@pytest.mark.parametrize("text,syllabus", [(SYLLABUS, True), (NOTES + " Paging splits memory into fixed size pages and frames.", False)])
def test_ask_teaches_a_listed_topic_from_general_knowledge_and_says_so(student, monkeypatch, text, syllabus):
    user_id, headers = student
    _add(user_id, text)
    prompts = []

    def fake(system, prompt, **kwargs):
        prompts.append(prompt)
        return {"answer": "Paging splits memory into pages.", "follow_up_question": "Why fixed size?", "source_topic": "Paging"}
    monkeypatch.setattr(voice_tutor, "llm_json", fake)
    out = client.post("/api/tutor/ask", headers=headers, json={"question": "explain paging", "language": "english"}).json()
    assert out["from_syllabus"] is syllabus
    assert ("only NAME the topic" in prompts[0]) is syllabus   # only a syllabus lets the model go beyond the notes
    assert out["sources"]                                      # the syllabus line is still cited: it is where the topic is named
