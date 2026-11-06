"""The "Next question" button in a live test: the server puts the next question on screen itself, at once, and tells the tutor to read it.
It never goes through the tutor's chat, and the tutor is told never to say "try again" once the right answer is shown."""
import asyncio

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, auth, db
from app.ai import live
from app.ai.tools import ask_quiz_question
from app.services import demo_seed, guests
from main import app  # noqa: F401


class FakeWS:
    def __init__(self):
        self.events = []

    async def send_json(self, event):
        self.events.append(event)


class FakeGemini:
    def __init__(self):
        self.sent = []

    async def send_realtime_input(self, **kwargs):
        self.sent.append(kwargs)


@pytest.fixture
def test_session():
    user_id = auth.read_token(guests.create("203.0.113.9")["token"])
    seeded = demo_seed.seed_demo(user_id)
    topic = next(t for t in seeded["topics"] if t["topic_name"] == "Precision")
    document = db.one("SELECT document_id FROM topics WHERE id = ?", (topic["id"],))["document_id"]
    ws = FakeWS()
    session = live.LiveTutorSession(ws, user_id, "english", document, [{"id": topic["id"], "topic_name": "Precision", "document_id": document}],
                                    mode="test", focus_topic={"id": topic["id"], "topic_name": "Precision", "document_id": document})
    yield session, ws, FakeGemini()
    accounts.erase_user(user_id)


def graded(session):
    session.ctx.results.append({"question_id": session.ctx.current_question_id, "attempt_id": 1, "is_correct": False,
                                "before": 38, "after": 30, "misconception": "x", "resolved": 0, "topic": "Precision"})


def test_it_is_ignored_until_the_question_on_screen_has_a_grade(test_session):
    session, ws, gemini = test_session
    asyncio.run(ask_quiz_question(session.ctx))
    ws.events.clear()
    asyncio.run(session._advance_test(gemini))
    assert ws.events == [] and gemini.sent == []


def test_the_next_question_is_on_screen_at_once_and_the_tutor_reads_it(test_session):
    session, ws, gemini = test_session
    asyncio.run(ask_quiz_question(session.ctx))
    graded(session)
    ws.events.clear()
    asyncio.run(session._advance_test(gemini))
    shown = [e for e in ws.events if e["type"] == "quiz_question"]
    assert len(shown) == 1 and shown[0]["number"] == 2 and shown[0]["total"] == 3
    note = gemini.sent[0]["text"]
    assert shown[0]["question"] in note and "Question 2 of 3" in note
    assert "try again" in note and "never" in note.lower()        # the tutor is told NOT to say it
    assert "Next question, please" not in note                    # and nothing is added to the chat


def test_after_the_last_question_the_tutor_is_told_to_summarise(test_session):
    session, ws, gemini = test_session
    for _ in range(3):
        asyncio.run(ask_quiz_question(session.ctx))
        graded(session)
    ws.events.clear()
    asyncio.run(session._advance_test(gemini))
    assert not [e for e in ws.events if e["type"] == "quiz_question"]
    assert "finished" in gemini.sent[0]["text"]


def test_the_demo_test_uses_new_numbers_and_the_right_answer_moves():
    """Question 1 of the Precision demo test must not repeat the worked example (8 of 10) and must grade correctly after mixing."""
    letters = set()
    for n in range(12):
        user_id = auth.read_token(guests.create("203.0.113.%d" % (20 + n))["token"])
        try:
            seeded = demo_seed.seed_demo(user_id)
            topic = next(t for t in seeded["topics"] if t["topic_name"] == "Precision")
            row = db.one("SELECT * FROM quiz_questions WHERE topic_id = ? AND question LIKE '%flags 12 emails%'", (topic["id"],))
            options = db.loads(row["options"], [])
            right = next(o for o in options if o[0] == row["correct"])
            assert right.endswith("75%") and "10 emails" not in row["question"]
            letters.add(row["correct"])
        finally:
            accounts.erase_user(user_id)
    assert len(letters) > 1   # the right answer does not always sit on the same letter
