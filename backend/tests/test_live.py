"""P3 tests: live voice session + tools, with Gemini Live replaced by a scripted fake.

These prove OUR code (event mapping, tool dispatch, barge-in, persistence, error handling).
They do NOT prove the real Gemini Live API behaves this way: run scripts/check_gemini.py with a key.
"""
from contextlib import asynccontextmanager
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app import db
from app.ai import gemini, live
from main import app

client = TestClient(app)


def sc(**kw):
    return NS(server_content=NS(**{"interrupted": False, "input_transcription": None, "output_transcription": None,
                                   "model_turn": None, "turn_complete": False, **kw}), tool_call=None, go_away=None)


def call(name, args, id_):
    return NS(server_content=None, go_away=None, tool_call=NS(function_calls=[NS(name=name, args=args, id=id_)]))


class FakeSession:
    """Mimics google.genai AsyncSession: scripted turns out, captured inputs in."""

    def __init__(self, script):
        self.script, self.sent, self.tool_responses = script, [], []

    async def send_realtime_input(self, **kw):
        self.sent.append(kw)

    async def send_client_content(self, turns=None, turn_complete=True):
        self.sent.append({"content": turns, "turn_complete": turn_complete})

    async def send_tool_response(self, function_responses):
        self.tool_responses.extend(function_responses)

    async def receive(self):
        if not self.script:
            import asyncio
            await asyncio.sleep(3600)  # idle until cancelled
        turn, self.script = self.script[0], self.script[1:]
        for m in turn:
            yield m


def fake_connect(session):
    @asynccontextmanager
    async def _c(system_prompt, tools=None, voice=None):
        session.system_prompt, session.tools, session.voice = system_prompt, tools, voice
        yield session
    return _c


def collect(ws, until="turn_complete"):
    events, audio = [], []
    while True:
        m = ws.receive()
        if m.get("bytes"):
            audio.append(m["bytes"])
            continue
        import json
        ev = json.loads(m["text"])
        events.append(ev)
        if ev["type"] in (until, "error"):
            return events, audio


def fake_text_gemini(system, prompt, required_keys=(), temperature=0.7, **_):
    """Text-model double: get_mission and misconception classification call Gemini text under the hood."""
    if "study coach" in system:
        return {"success": True, "data": {"mission_title": "Fix Precision vs Recall Confusion", "reason": "r",
                                          "tasks": ["Re-read", "Explain aloud", "Answer 3"]}}
    return {"success": True, "data": {"label": "definition_mixup", "misconception_text": "mixed up terms"}}


@pytest.fixture(autouse=True)
def seeded(monkeypatch):
    monkeypatch.setattr(gemini, "call_llm_json", fake_text_gemini)
    client.post("/api/demo/seed")


def test_full_voice_turn_with_tools(monkeypatch):
    prec = db.one("SELECT id FROM topics WHERE topic_name = 'Precision'")["id"]
    script = [[
        sc(input_transcription=NS(text="Mujhe precision ")), sc(input_transcription=NS(text="samjhao")),
        call("search_notes", {"query": "precision definition"}, "c1"),
        call("report_learner_state", {"topic": "Precision", "confusion": 0.7, "confidence": 0.3, "frustration": 0.1,
                                      "note": "unsure about denominator"}, "c2"),
        sc(output_transcription=NS(text="Haan, precision matlab ")),
        sc(model_turn=NS(parts=[NS(inline_data=NS(data=b"\x01\x02" * 100, mime_type="audio/pcm;rate=24000"))])),
        sc(output_transcription=NS(text="flagged emails mein se kitne sahi.")),
        call("ask_quiz_question", {"topic": "precision"}, "c3"),
        sc(turn_complete=True),
    ], [
        call("grade_answer", {"student_answer": "A", "confidence": 0.8}, "c4"),
        call("get_mission", {}, "c5"),
        sc(interrupted=True),
        sc(turn_complete=True),
    ]]
    fake = FakeSession(script)
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))

    with client.websocket_connect("/ws/voice?user_id=1&lang=hinglish") as ws:
        ws.send_bytes(b"\x00\x01" * 160)               # mic audio goes to Gemini
        ev1, audio = collect(ws)
        ev2, _ = collect(ws)

    # greeting prompt + mic audio reached Gemini; persona was filled in
    assert any("just joined" in str(s.get("text", "")) for s in fake.sent)
    assert any(s.get("audio") is not None and s["audio"].mime_type == "audio/pcm;rate=16000" for s in fake.sent)
    assert "Hinglish" in fake.system_prompt and "Precision" in fake.system_prompt and "{{" not in fake.system_prompt

    types1 = [e["type"] for e in ev1]
    assert audio and audio[0] == b"\x01\x02" * 100                       # tutor audio forwarded as binary
    user_final = next(e for e in ev1 if e["type"] == "transcript" and e["role"] == "user" and e["final"])
    assert user_final["text"] == "Mujhe precision samjhao"
    tutor_final = next(e for e in ev1 if e["type"] == "transcript" and e["role"] == "tutor" and e["final"])
    assert tutor_final["text"] == "Haan, precision matlab flagged emails mein se kitne sahi."
    emo = next(e for e in ev1 if e["type"] == "emotion")
    assert (emo["topic"], emo["confusion"], emo["confidence"]) == ("Precision", 0.7, 0.3)
    q = next(e for e in ev1 if e["type"] == "quiz_question")
    assert q["topic"] == "Precision" and "correct" not in q and len(q["options"]) == 4
    assert types1[-1] == "turn_complete"

    # tool results went back to the model; search found the Precision notes
    by_id = {r.id: r.response for r in fake.tool_responses}
    assert by_id["c1"]["found"] and by_id["c1"]["results"][0]["topic"] == "Precision"
    assert by_id["c2"] == {"ok": True}
    assert by_id["c3"]["available"] and len(by_id["c3"]["options"]) == 4

    # turn 2: graded server-side, mastery event, mission, barge-in
    mastery = next(e for e in ev2 if e["type"] == "mastery")
    assert mastery["topic"] == "Precision" and mastery["before"] == 38
    if mastery["is_correct"]:
        assert mastery["after"] > 38
    else:
        assert mastery["after"] < 38 and mastery["misconception"]["text"]
    assert next(e for e in ev2 if e["type"] == "mission")["duration_minutes"] == 15
    assert "interrupted" in [e["type"] for e in ev2]
    assert by_id["c4"]["mastery_after"] == mastery["after"]
    assert by_id["c5"]["minutes"] == 15 and by_id["c5"]["tasks"]

    # persisted
    assert db.one("SELECT COUNT(*) AS n FROM learner_state")["n"] >= 1
    assert db.one("SELECT COUNT(*) AS n FROM transcripts")["n"] >= 2
    sess = db.one("SELECT * FROM voice_sessions ORDER BY id DESC LIMIT 1")
    assert sess["mode"] == "gemini-live" and sess["ended_at"] and sess["turns"] == 2
    assert db.one("SELECT COUNT(*) AS n FROM agent_logs WHERE agent_name = 'learner_profile'")["n"] >= 1


def test_grade_without_question_and_unknown_tool_are_reported_to_the_model_not_crashed(monkeypatch):
    script = [[call("grade_answer", {"student_answer": "B"}, "g1"), call("nope", {}, "g2"), sc(turn_complete=True)]]
    fake = FakeSession(script)
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect("/ws/voice") as ws:
        collect(ws)
    by_id = {r.id: r.response for r in fake.tool_responses}
    assert "error" in by_id["g1"] and "ask_quiz_question" in by_id["g1"]["error"]
    assert "Unknown tool" in by_id["g2"]["error"]


class DroppingSession(FakeSession):
    """A session that dies while the tutor is talking, like a real upstream drop."""

    async def receive(self):
        raise ConnectionError("received 1011 (internal error) keepalive ping timeout; then sent 1011 (internal error)")
        yield  # pragma: no cover


def connect_sequence(*sessions):
    """Each connection attempt gets the next session; their system prompts and first inputs are kept for checking."""
    attempts = list(sessions)
    seen = []

    @asynccontextmanager
    async def _c(system_prompt, tools=None, voice=None):
        session = attempts.pop(0)
        seen.append(session)
        session.system_prompt = system_prompt
        yield session
    return _c, seen


def test_gemini_connection_failure_is_a_coded_error_never_raw_text(monkeypatch):
    @asynccontextmanager
    async def boom(system_prompt, tools=None, voice=None):
        raise RuntimeError("models/gemini-x is not found for API version v1beta")
        yield  # pragma: no cover

    monkeypatch.setattr(live, "default_connect", boom)
    monkeypatch.setattr(live, "RECONNECTS", 0)
    with client.websocket_connect("/ws/voice") as ws:
        ev, _ = collect(ws, until="error")
    err = ev[-1]
    assert err["type"] == "error" and err["code"] == "upstream_unavailable" and err["retryable"] is True
    assert "not found" not in err["message"] and "Gemini Live failed" not in err["message"]   # provider text stays in the server log


def test_quota_errors_get_their_own_code(monkeypatch):
    assert live.classify_error(RuntimeError("429 RESOURCE_EXHAUSTED: quota")) == ("quota", True)
    assert live.classify_error(RuntimeError("GEMINI_API_KEY is not set")) == ("not_configured", False)
    assert live.classify_error(TimeoutError("timed out during opening handshake")) == ("upstream_unavailable", True)


def test_a_dropped_connection_is_retried_once_and_the_quiz_is_resumed(monkeypatch):
    first = FakeSession([[call("ask_quiz_question", {}, "q1")], [sc(turn_complete=True)]])
    first_receive = first.receive

    async def drop_after_question():
        async for m in first_receive():
            yield m
        raise ConnectionError("keepalive ping timeout")
    first.receive = drop_after_question
    second = FakeSession([[sc(turn_complete=True)]])
    connect, seen = connect_sequence(first, second)
    monkeypatch.setattr(live, "default_connect", connect)
    monkeypatch.setattr(live.asyncio, "sleep", live.asyncio.sleep)   # keep the real sleep; the retry waits one second

    uid = client.post("/api/auth/signup", json={"email": "resume@example.com", "password": "longenough1"}).json()
    token, user = uid["token"], uid["user"]["id"]
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'n.txt')", (user,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Recall')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, 'Recall', 'Recall is TP over TP+FN.')", (doc, topic))
    db.execute("INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) VALUES (?, 'What is recall?', ?, 'A', 'x', '{}')",
               (topic, '["A. TP/(TP+FN)", "B. TP/(TP+FP)", "C. a", "D. b"]'))
    try:
        with client.websocket_connect(f"/ws/voice?token={token}&mode=test&topic_id={topic}") as ws:
            events, _ = collect(ws, until="reconnecting")
            assert [e["type"] for e in events].count("quiz_question") == 1
            collect(ws, until="turn_complete")           # the second connection works and the call goes on
    finally:
        from app import accounts
        accounts.erase_user(user)
    assert len(seen) == 2
    resume_text = seen[1].sent[0]["text"]
    assert "connection dropped" in resume_text and "What is recall?" in resume_text and "waiting for the student" in resume_text


def test_a_second_drop_ends_with_a_retryable_error_and_no_raw_text(monkeypatch):
    connect, seen = connect_sequence(DroppingSession([]), DroppingSession([]))
    monkeypatch.setattr(live, "default_connect", connect)
    with client.websocket_connect("/ws/voice") as ws:
        events, _ = collect(ws, until="error")
    assert [e["type"] for e in events] == ["reconnecting", "error"] or events[-1]["type"] == "error"
    err = events[-1]
    assert err["code"] == "upstream_unavailable" and err["retryable"] and "1011" not in err["message"]
    assert len(seen) == 2


def test_gemini_go_away_reconnects_instead_of_ending(monkeypatch):
    goaway = FakeSession([[NS(server_content=None, tool_call=None, go_away=NS(time_left="5s"))]])
    after = FakeSession([[sc(turn_complete=True)]])
    connect, seen = connect_sequence(goaway, after)
    monkeypatch.setattr(live, "default_connect", connect)
    with client.websocket_connect("/ws/voice") as ws:
        events, _ = collect(ws, until="reconnecting")
        collect(ws, until="turn_complete")
    assert len(seen) == 2


def test_lesson_without_notes_is_told_to_upload_first():
    token = client.post("/api/auth/signup", json={"email": "nonotes@example.com", "password": "longenough1"}).json()["token"]
    with client.websocket_connect(f"/ws/voice?token={token}&mode=learn&topic_id=1") as ws:
        ev = ws.receive_json()
    assert ev["type"] == "error" and ev["code"] == "need_notes" and "Upload your notes" in ev["message"]


def test_plain_conversation_needs_no_notes(monkeypatch):
    token = client.post("/api/auth/signup", json={"email": "chatonly@example.com", "password": "longenough1"}).json()["token"]
    fake = FakeSession([[sc(turn_complete=True)]])
    connect, seen = connect_sequence(fake)
    monkeypatch.setattr(live, "default_connect", connect)
    with client.websocket_connect(f"/ws/voice?token={token}") as ws:
        events, _ = collect(ws, until="turn_complete")
    assert not any(e.get("code") == "need_notes" for e in events)
    assert "has not added notes" in seen[0].system_prompt and "general knowledge" in seen[0].system_prompt


def test_user_text_goes_to_gemini_and_shows_as_transcript(monkeypatch):
    fake = FakeSession([[sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "user_text", "text": "what is recall"})
        ev = []
        while True:  # wait until the server has processed the text (the scripted turn_complete arrives immediately)
            e = ws.receive_json()
            ev.append(e)
            if e["type"] == "transcript" and e["role"] == "user":
                break
    assert any(s.get("text") == "what is recall" for s in fake.sent)
    assert any(e["type"] == "transcript" and e["role"] == "user" and e["text"] == "what is recall" for e in ev)


def test_a_call_that_drops_can_be_picked_up_again_with_its_progress(monkeypatch):
    """The browser's own connection drops mid-quiz: its token brings back the questions asked and the graded answers."""
    live._resumable.clear()
    first = FakeSession([[call("ask_quiz_question", {}, "q1")]])
    connect, seen = connect_sequence(first)
    monkeypatch.setattr(live, "default_connect", connect)
    uid = client.post("/api/auth/signup", json={"email": "drop@example.com", "password": "longenough1"}).json()
    token, user = uid["token"], uid["user"]["id"]
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'n.txt')", (user,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Recall')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, 'Recall', 'Recall is TP over TP+FN.')", (doc, topic))
    db.execute("INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) VALUES (?, 'What is recall?', ?, 'A', 'x', '{}')",
               (topic, '["A. TP/(TP+FN)", "B. TP/(TP+FP)", "C. a", "D. b"]'))
    try:
        with client.websocket_connect(f"/ws/voice?token={token}&mode=test&topic_id={topic}") as ws:
            events, _ = collect(ws, until="quiz_question")
            session_id = next(e["id"] for e in events if e["type"] == "session")
            # the browser vanishes without sending {"type": "end"}
        assert session_id in live._resumable

        second = FakeSession([[sc(turn_complete=True)]])
        connect2, seen2 = connect_sequence(second)
        monkeypatch.setattr(live, "default_connect", connect2)
        with client.websocket_connect(f"/ws/voice?token={token}&mode=test&topic_id={topic}&resume={session_id}") as ws:
            collect(ws, until="turn_complete")
        assert "connection dropped" in seen2[0].sent[0]["text"] and "What is recall?" in seen2[0].sent[0]["text"]
        assert session_id not in live._resumable                      # a token works once
        other = client.post("/api/auth/signup", json={"email": "thief@example.com", "password": "longenough1"}).json()
        assert live.take_resume(session_id, other["user"]["id"]) is None   # and only for the same student
    finally:
        from app import accounts
        accounts.erase_user(user)
        for row in db.query("SELECT id FROM users WHERE email = 'thief@example.com'"):
            accounts.erase_user(row["id"])


def test_a_call_the_student_ended_cannot_be_resumed(monkeypatch):
    live._resumable.clear()
    session = FakeSession([[sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(session))
    with client.websocket_connect("/ws/voice") as ws:
        collect(ws)
        ws.send_json({"type": "end"})
    assert not live._resumable
