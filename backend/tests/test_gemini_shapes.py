"""Gemini answers in more than one JSON shape; the agents must cope instead of failing the whole feature."""
import pytest

from app import db
from app.agents import document_intelligence as docs
from app.agents import quiz
from app.ai import gemini
from app.errors import LLMError

QUESTION = {
    "question": "Which statement about Turing machines is true?",
    "options": ["A. They can simulate any algorithm", "B. They have no tape", "C. They only accept finite languages", "D. They are weaker than DFAs"],
    "correct": "A", "explanation": "Church-Turing thesis.",
    "misconceptions": {"B": {"label": "definition_mixup", "text": "Thinks a Turing machine has no tape."}},
}


@pytest.fixture()
def topic_id():
    db.init_db()
    db.ensure_user(1)
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (1, 'shapes.txt')")
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Turing Machines')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, 'Unit-V', 'Turing machine techniques for construction.')", (doc, topic))
    return topic


def reply(monkeypatch, data):
    monkeypatch.setattr(gemini, "call_llm_json", lambda *a, **k: {"success": True, "data": data})


@pytest.mark.parametrize("shape", [
    {"questions": [QUESTION]},          # the documented shape
    [QUESTION],                         # a bare array
    {"quiz": [QUESTION]},               # a different key
    {"result": [QUESTION]},             # any single list
])
def test_questions_are_accepted_in_every_shape(monkeypatch, topic_id, shape):
    reply(monkeypatch, shape)
    created = quiz._generate_with_llm(topic_id, 1, "Medium")
    assert len(created) == 1
    stored = db.one("SELECT correct, misconceptions FROM quiz_questions WHERE id = ?", (created[0],))
    assert stored["correct"] == "A" and "tape" in stored["misconceptions"]


@pytest.mark.parametrize("bad", [{}, [], {"questions": []}, {"questions": [{"question": "no options"}]}, {"questions": ["text"]}])
def test_unusable_question_replies_are_a_clear_llm_error_not_an_empty_quiz(monkeypatch, topic_id, bad):
    reply(monkeypatch, bad)
    with pytest.raises(LLMError, match="usable questions"):
        quiz._generate_with_llm(topic_id, 1, "Medium")


def test_topics_are_accepted_as_a_bare_list_too(monkeypatch):
    db.init_db()
    reply(monkeypatch, ["Automata", "  Grammars ", "Automata", ""])
    assert docs._llm_topics("some notes") == ["Automata", "Grammars"]       # trimmed, de-duplicated, blanks dropped


def test_extract_list_handles_each_shape():
    assert gemini.extract_list([1, 2]) == [1, 2]
    assert gemini.extract_list({"a": [1]}, "a") == [1]
    assert gemini.extract_list({"x": [1], "y": 5}) == [1]
    assert gemini.extract_list({"x": [1], "y": [2]}) == []                    # ambiguous: refuse to guess
    assert gemini.extract_list("text") == []


def test_warm_up_writes_missing_questions_once_and_never_raises(monkeypatch, topic_id):
    calls = []

    def fake(system, prompt, required_keys=(), temperature=0.7, **_):
        calls.append(1)
        return {"success": True, "data": {"questions": [QUESTION]}}

    monkeypatch.setattr(gemini, "call_llm_json", fake)
    quiz.warm_up(topic_id, count=1)
    quiz.warm_up(topic_id, count=1)                                           # already enough: no second Gemini call
    assert len(calls) == 1
    assert db.one("SELECT COUNT(*) AS n FROM quiz_questions WHERE topic_id = ?", (topic_id,))["n"] == 1

    monkeypatch.setattr(gemini, "call_llm_json", lambda *a, **k: {"success": False, "error": "timeout"})
    quiz.warm_up(topic_id, count=3)                                           # Gemini down: swallowed (logged), not raised


class _FakeResponse:
    text = '{"ok": true}'


def test_a_briefly_overloaded_gemini_is_retried_after_a_pause(monkeypatch):
    attempts, pauses = [], []

    class Models:
        def generate_content(self, **_):
            attempts.append(1)
            if len(attempts) < 3:
                raise RuntimeError("503 UNAVAILABLE. This model is currently experiencing high demand.")
            return _FakeResponse()

    class Client:
        models = Models()

    monkeypatch.setattr(gemini, "_get_client", lambda: Client())
    monkeypatch.setattr(gemini.time, "sleep", lambda seconds: pauses.append(seconds))
    gemini._cache.clear()
    result = gemini.call_llm_json("s", "retry-prompt-1")
    assert result == {"success": True, "data": {"ok": True}} and len(attempts) == 3
    assert pauses == [2, 4]                                                       # a growing pause between tries


def test_errors_that_will_not_get_better_are_not_retried_slowly(monkeypatch):
    attempts, pauses = [], []

    class Models:
        def generate_content(self, **_):
            attempts.append(1)
            raise RuntimeError("400 INVALID_ARGUMENT: bad request")

    class Client:
        models = Models()

    monkeypatch.setattr(gemini, "_get_client", lambda: Client())
    monkeypatch.setattr(gemini.time, "sleep", lambda seconds: pauses.append(seconds))
    gemini._cache.clear()
    result = gemini.call_llm_json("s", "retry-prompt-2")
    assert result["success"] is False and "INVALID_ARGUMENT" in result["error"]
    assert pauses == []                                                           # no waiting for a hopeless request
