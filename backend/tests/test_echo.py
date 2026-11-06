"""The tutor hearing itself: its own voice through the speakers must never answer the question for the student."""
import asyncio
import time
from types import SimpleNamespace as NS

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, auth, db
from app.ai import live
from app.ai.tools import ask_quiz_question, grade_answer
from app.domain import echo
from app.services import demo_seed, guests
from main import app  # noqa: F401


# ---- the pure rules
@pytest.mark.parametrize("text,expected", [("D", True), ("d.", True), ("option B", True), ("A, B, C or D", True), ("a b c or d", True),
                                           ("seventy five percent", False), ("TP divided by TP plus FP", False), ("The answer is 75%", False)])
def test_a_bare_letter_is_recognised(text, expected):
    assert echo.is_letter_answer(text) is expected


def test_nothing_counts_while_the_tutor_speaks_and_for_a_moment_after_during_a_test():
    assert echo.is_echo("seventy five percent", seconds_since_tutor=-1.0, test_open=True)    # still speaking
    assert echo.is_echo("seventy five percent", seconds_since_tutor=0.5, test_open=True)     # 0.5 s after
    assert not echo.is_echo("seventy five percent", seconds_since_tutor=1.0, test_open=True)  # a real answer, after the tail
    assert not echo.is_echo("seventy five percent", seconds_since_tutor=0.1, test_open=False)  # outside a test the full window is not applied


def test_a_single_word_right_after_the_tutor_is_dropped_but_a_sentence_is_not():
    assert echo.is_echo("D", seconds_since_tutor=1.2, test_open=False)
    assert not echo.is_echo("D", seconds_since_tutor=1.6, test_open=False)
    assert not echo.is_echo("aap kya bol rahe ho", seconds_since_tutor=1.2, test_open=False)


def test_what_the_tutor_just_said_coming_back_is_dropped():
    said = "Which formula gives precision? Is it A, TP divided by TP plus TN; B, TP divided by TP plus FP"
    assert echo.is_echo("which formula gives precision", seconds_since_tutor=5, test_open=False, last_tutor_text=said)
    assert echo.is_echo("Which formula gives precision? Is it A, TP divided by TP plus TN; B, TP divided by TP plus FP", seconds_since_tutor=5, test_open=False, last_tutor_text=said)
    assert not echo.is_echo("mujhe samajh nahi aaya", seconds_since_tutor=5, test_open=False, last_tutor_text=said)


# ---- the live session
class FakeWS:
    def __init__(self):
        self.events, self.audio = [], []

    async def send_json(self, event):
        self.events.append(event)

    async def send_bytes(self, data):
        self.audio.append(data)


class FakeGemini:
    def __init__(self):
        self.sent = []

    async def send_realtime_input(self, **kwargs):
        self.sent.append(kwargs)


@pytest.fixture
def test_session():
    user_id = auth.read_token(guests.create("203.0.113.55")["token"])
    seeded = demo_seed.seed_demo(user_id)
    topic = next(t for t in seeded["topics"] if t["topic_name"] == "Precision")
    document = db.one("SELECT document_id FROM topics WHERE id = ?", (topic["id"],))["document_id"]
    ws = FakeWS()
    focus = {"id": topic["id"], "topic_name": "Precision", "document_id": document}
    session = live.LiveTutorSession(ws, user_id, "english", document, [focus], mode="test", focus_topic=focus)
    asyncio.run(ask_quiz_question(session.ctx))   # Question 1 is on screen, waiting for an answer
    ws.events.clear()
    yield session, ws, FakeGemini()
    accounts.erase_user(user_id)


def heard(text):
    return NS(server_content=NS(input_transcription=NS(text=text), output_transcription=None, model_turn=None, interrupted=False, turn_complete=False), tool_call=None, go_away=None)


def tutor_audio(seconds=3.0):
    part = NS(inline_data=NS(data=b"\0" * int(seconds * echo.PCM_BYTES_PER_SECOND)))
    return NS(server_content=NS(input_transcription=None, output_transcription=None, model_turn=NS(parts=[part]), interrupted=False, turn_complete=False), tool_call=None, go_away=None)


def test_a_D_heard_while_the_tutor_is_speaking_changes_nothing(test_session):
    session, ws, gemini = test_session
    before = (session.ctx.current_question_id, list(session.ctx.asked_ids), list(session.ctx.results))
    asyncio.run(session._handle(gemini, tutor_audio(3.0)))     # the tutor starts reading the options
    asyncio.run(session._handle(gemini, heard("D")))          # ...and its own voice comes back as "D"
    asyncio.run(session._final("user"))
    assert [e for e in ws.events if e["type"] == "transcript" and e["role"] == "user"] == []          # not shown as "You: D"
    assert db.one("SELECT COUNT(*) AS n FROM transcripts WHERE session_id IS ? AND role = 'user'", (session.session_id,))["n"] == 0
    assert (session.ctx.current_question_id, session.ctx.asked_ids, session.ctx.results) == before     # the test state did not move


def test_a_spoken_letter_cannot_be_graded_but_a_tapped_one_can(test_session, monkeypatch):
    monkeypatch.delenv("LETTER_GUARD", raising=False)   # the real rule
    session, ws, gemini = test_session
    ctx = session.ctx
    spoken = asyncio.run(grade_answer(ctx, "D", 0.8))
    assert spoken.get("unclear") and not ctx.results                                  # an echoed letter is refused, nothing graded
    ctx.typed_answer_until = time.monotonic() + 10                                      # the student tapped an option
    tapped = asyncio.run(grade_answer(ctx, "D", 0.8))
    assert "is_correct" in tapped and len(ctx.results) == 1
    again = asyncio.run(ask_quiz_question(ctx))
    assert again.get("available")                                                       # the test moves on only after a real answer
    refused_again = asyncio.run(grade_answer(ctx, "B", 0.8))
    assert refused_again.get("unclear") and len(ctx.results) == 1                       # the tap was used once: a second echo does not count


def test_the_full_option_text_can_still_be_said_aloud(test_session):
    session, ws, gemini = test_session
    ctx = session.ctx
    row = db.one("SELECT options, correct FROM quiz_questions WHERE id = ?", (ctx.current_question_id,))
    right = next(o for o in db.loads(row["options"], []) if o[0] == row["correct"]).split(". ", 1)[1]
    graded = asyncio.run(grade_answer(ctx, right, 0.8))
    assert not graded.get("unclear") and "is_correct" in graded                          # saying the answer in words is accepted


def test_microphone_audio_is_not_passed_on_while_the_tutor_speaks_in_a_test(test_session):
    session, ws, gemini = test_session
    assert not session._mic_gated()
    asyncio.run(session._handle(gemini, tutor_audio(2.0)))
    assert session._mic_gated()                                                        # 2 s of speech queued: the microphone is not listened to
    session.tutor_audio_until = time.monotonic() - 0.5
    assert session._mic_gated()                                                        # 0.5 s after it ended: still inside the 0.8 s tail
    session.tutor_audio_until = time.monotonic() - 1.0
    assert not session._mic_gated()                                                    # then it listens again


def test_typed_answers_are_never_taken_for_an_echo(test_session):
    session, ws, gemini = test_session
    asyncio.run(session._handle(gemini, tutor_audio(2.0)))                               # the tutor is mid-sentence
    session.user_buf = "D"
    asyncio.run(session._final("user", typed=True))
    assert [e["text"] for e in ws.events if e["type"] == "transcript" and e["role"] == "user"] == ["D"]
