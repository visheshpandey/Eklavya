"""Teach-then-test flow: pick a topic, learn it by voice, then take a 3-question voice test.

Uses the scripted fake of Gemini Live from test_live (proves our logic, not Gemini's behaviour).
"""
import json

import pytest
from fastapi.testclient import TestClient

from app import db
from app.agents import quiz
from app.ai import live
from main import app
from test_live import FakeSession, call, collect, fake_connect, sc, seeded  # noqa: F401  (seeded = autouse fixture)

client = TestClient(app)


def topic_id(name):
    return db.one("SELECT id FROM topics WHERE topic_name = ? ORDER BY id DESC", (name,))["id"]


def read_turns(ws, n):
    events = []
    for _ in range(n):
        ev, _ = collect(ws)
        events += ev
    return events


def test_topic_detail_shows_the_notes_for_that_topic():
    d = client.get(f"/api/topics/{topic_id('Precision')}").json()
    assert d["topic_name"] == "Precision" and d["mastery"] == 38 and d["question_count"] == 3
    assert "TP / (TP + FP)" in " ".join(n["text"] for n in d["notes"])
    assert client.get("/api/topics/99999").status_code == 404


def test_next_question_skips_asked_ones_and_runs_out():
    tid = topic_id("Recall")                       # 2 stored questions, none solved yet
    a = quiz.next_question(1, tid)
    b = quiz.next_question(1, tid, exclude=[a["question_id"]])
    assert a["question_id"] != b["question_id"]


def test_learn_mode_plan_and_full_teach_then_test_flow(monkeypatch):
    tid = topic_id("Precision")
    script = [
        [call("search_notes", {"query": "Precision"}, "t1"), sc(turn_complete=True)],      # teaching
        [call("ask_quiz_question", {"topic": "Recall"}, "q1"), sc(turn_complete=True)],    # asks (topic arg must be ignored)
        [call("grade_answer", {"student_answer": "A", "confidence": 0.8}, "g1"), sc(turn_complete=True)],   # wrong
        [call("ask_quiz_question", {}, "q2"), sc(turn_complete=True)],
        [call("grade_answer", {"student_answer": "B", "confidence": 0.8}, "g2"), sc(turn_complete=True)],   # right
        [call("ask_quiz_question", {}, "q3"), sc(turn_complete=True)],
        [call("grade_answer", {"student_answer": "B", "confidence": 0.8}, "g3"), sc(turn_complete=True)],   # right -> done
        [call("ask_quiz_question", {}, "q4"), sc(turn_complete=True)],                     # test already finished
    ]
    fake = FakeSession(script)
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))

    with client.websocket_connect(f"/ws/voice?user_id=1&lang=hinglish&mode=learn&topic_id={tid}") as ws:
        ev = read_turns(ws, len(script))

    # the model was told the plan and the opening instruction names the topic
    assert 'LEARN, then TEST. Topic: "Precision"' in fake.system_prompt and "{{" not in fake.system_prompt
    assert any('chose to learn "Precision"' in str(s.get("text", "")) for s in fake.sent)

    phases = [(e["phase"], e["topic"]) for e in ev if e["type"] == "phase"]
    assert phases == [("teaching", "Precision"), ("test", "Precision"), ("summary", "Precision")]

    qs = [e for e in ev if e["type"] == "quiz_question"]
    assert [(q["number"], q["total"], q["topic"]) for q in qs] == [(1, 3, "Precision"), (2, 3, "Precision"), (3, 3, "Precision")]
    assert len({q["question_id"] for q in qs}) == 3                       # no repeats
    assert "correct" not in qs[0]

    summary = next(e for e in ev if e["type"] == "test_summary")
    assert summary["correct"] == 2 and summary["total"] == 3 and summary["mastery_before"] == 38
    assert summary["mastery_after"] > summary["mastery_before"] - 10 and summary["misconceptions"]

    by_id = {r.id: r.response for r in fake.tool_responses}
    assert by_id["g3"]["test_complete"] is True and "get_mission" in by_id["g3"]["instruction"]
    assert "test_complete" not in by_id["g2"]
    assert by_id["q4"]["available"] is False and by_id["q4"]["test_complete"] is True
    assert db.one("SELECT COUNT(*) AS n FROM quiz_attempts")["n"] == 3


def test_test_mode_skips_teaching(monkeypatch):
    tid = topic_id("Recall")
    fake = FakeSession([[call("ask_quiz_question", {}, "q1"), sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect(f"/ws/voice?mode=test&topic_id={tid}") as ws:
        ev, _ = collect(ws)
        rest = []
        while not any(e["type"] == "quiz_question" for e in ev + rest):
            rest.append(json.loads(ws.receive()["text"]))
    assert 'TEST. Topic: "Recall"' in fake.system_prompt and "Do not teach first" in fake.system_prompt
    assert any('tested on "Recall"' in str(s.get("text", "")) for s in fake.sent)
    assert [e["phase"] for e in ev + rest if e["type"] == "phase"][0] == "test"


def test_picking_a_missing_topic_is_an_error_not_a_free_chat():
    with client.websocket_connect("/ws/voice?mode=learn&topic_id=99999") as ws:
        ev = ws.receive_json()
    assert ev["type"] == "error" and "Pick a topic" in ev["message"]
