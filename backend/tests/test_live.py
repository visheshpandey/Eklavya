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
    async def _c(system_prompt):
        session.system_prompt = system_prompt
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


def test_gemini_connection_failure_is_an_error_event_not_a_crash(monkeypatch):
    @asynccontextmanager
    async def boom(system_prompt):
        raise RuntimeError("model not found")
        yield  # pragma: no cover

    monkeypatch.setattr(live, "default_connect", boom)
    with client.websocket_connect("/ws/voice") as ws:
        ev, _ = collect(ws, until="error")
    assert ev[-1]["type"] == "error" and "Gemini Live failed" in ev[-1]["message"] and "model not found" in ev[-1]["message"]


def test_no_notes_uploaded_is_told_to_upload_first():
    with db.get_conn() as c:
        c.execute("DELETE FROM documents WHERE user_id = 77")
    with client.websocket_connect("/ws/voice?user_id=77") as ws:
        ev = ws.receive_json()
    assert ev["type"] == "error" and "Upload your notes" in ev["message"]


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
