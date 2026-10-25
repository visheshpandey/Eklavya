"""P2 tests: mastery math, retrieval, and the full demo journey.

Gemini is replaced by a test double (the project itself has no fallback content: a Gemini
failure is a 502). Run from backend/:  python -m pytest tests -q
"""
import os

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.ai import gemini  # noqa: E402
from app.domain import mastery  # noqa: E402
from app.domain import retrieval  # noqa: E402
from app.agents.evaluation import parse_choice  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)
GEMINI_DOWN = {"on": False}


def fake_gemini(system, prompt, required_keys=(), temperature=0.7):
    """Stands in for Gemini; keyed on which agent is calling."""
    if GEMINI_DOWN["on"]:
        return {"success": False, "error": "Generation failed: simulated outage"}
    if "topic structure" in system:
        return {"success": True, "data": {"topics": ["Photosynthesis", "Respiration"]}}
    if "Eklavya" in system:
        return {"success": True, "data": {"answer": "F1 combines precision and recall.",
                                          "follow_up_question": "Why does low recall hurt F1?", "source_topic": "F1 Score"}}
    if "study coach" in system:
        return {"success": True, "data": {"mission_title": "Fix Precision vs Recall Confusion",
                                          "reason": "You divided by real spam instead of flagged emails.",
                                          "tasks": ["Re-read Precision", "Explain it aloud", "Answer 3 questions"]}}
    if "misconception behind" in system:
        return {"success": True, "data": {"label": "definition_mixup", "misconception_text": "Mixed up two terms."}}
    return {"success": False, "error": "unexpected agent in test"}


@pytest.fixture(autouse=True)
def _gemini(monkeypatch):
    GEMINI_DOWN["on"] = False
    monkeypatch.setattr(gemini, "call_llm_json", fake_gemini)


def test_mastery_rule():
    assert mastery.update_mastery(38, True, 0.5) == 47.3      # +15*(1-0.38)
    assert mastery.update_mastery(38, False, 1.0) == 28.0     # -10*1
    assert mastery.update_mastery(2, False, 1.0) == 0.0       # clamp low
    assert mastery.update_mastery(99, True, 1.0) <= 100.0     # clamp high


def test_parse_choice():
    opts = ["A. 40%", "B. 80%", "C. 20%", "D. 60%"]
    assert parse_choice("B", opts) == "B"
    assert parse_choice("option c", opts) == "C"
    assert parse_choice("bee", opts) == "B"
    assert parse_choice("I think it is 80%", opts) == "B"
    assert parse_choice("hmm not sure", opts) is None


def test_chunking_uses_headings():
    text = open(os.path.join(os.path.dirname(__file__), "..", "..", "samples", "ml_notes.txt"), encoding="utf-8").read()
    chunks = retrieval.chunk_text(text)
    assert [c["heading"] for c in chunks][-3:] == ["Precision", "Recall", "F1 Score"]


def test_full_demo_journey():
    seed = client.post("/api/demo/seed").json()
    names = [t["topic_name"] for t in seed["topics"]]
    assert names == ["Classification in Machine Learning", "Confusion Matrix", "Precision", "Recall", "F1 Score"]
    doc = seed["document_id"]

    # retrieval: Hinglish query finds the Precision and Recall sections
    top = retrieval.retrieve(doc, "Mujhe precision aur recall simple example se samjhao")
    assert {"Precision", "Recall"} <= {c["topic"] for c in top[:3]}
    ans = client.post("/api/tutor/ask", json={"question": "what is the F1 score", "language": "english"}).json()
    assert ans["grounded"] and ans["source_topic"] == "F1 Score" and ans["follow_up_question"]
    assert client.post("/api/tutor/ask", json={"question": "quantum chromodynamics"}).json()["grounded"] is False

    d = client.get("/api/dashboard").json()
    prec = next(m for m in d["mastery"] if m["topic_name"] == "Precision")
    assert prec["mastery_score"] == 38 and d["weak_topics"][0]["topic_name"] == "Precision"

    # question payload must not leak the answer
    q = client.post("/api/quiz/generate", json={"topic_id": prec["topic_id"], "count": 3}).json()["questions"]
    assert len(q) == 3 and "correct" not in q[0] and "misconceptions" not in q[0]

    # wrong answer -> named misconception, mastery drops, mission targets Precision
    r = client.post("/api/quiz/submit", json={"question_id": q[0]["question_id"], "student_answer": "A", "confidence": 0.8}).json()
    assert r["is_correct"] is False and r["misconception"]["label"] == "definition_mixup"
    assert r["misconception"]["severity"] == "high" and r["mastery_after"] < r["mastery_before"] == 38
    m = client.post("/api/missions/generate", json={}).json()
    assert m["topic"] == "Precision" and m["priority"] == "High" and m["duration_minutes"] == 15
    assert m["mission_title"] == "Fix Precision vs Recall Confusion" and len(m["tasks"]) >= 3

    # remediation: correct answers raise mastery and resolve the misconception
    last = r["mastery_after"]
    for qq in q:
        res = client.post("/api/quiz/submit", json={"question_id": qq["question_id"], "student_answer": "B", "confidence": 0.8}).json()
        assert res["is_correct"] is True and res["mastery_after"] > last
        last = res["mastery_after"]
    assert client.get("/api/dashboard").json()["misconceptions_resolved"] == 1
    assert last > 38

    # unclear spoken answer changes nothing
    unclear = client.post("/api/quiz/submit", json={"question_id": q[0]["question_id"], "student_answer": "hmm not sure"}).json()
    assert unclear["unclear"] is True

    log = client.get("/api/dashboard").json()["agent_log"]
    assert {"misconception", "study_mission", "evaluation"} <= {e["agent_name"] for e in log}


def test_upload_document_topics_come_from_gemini():
    text = ("Photosynthesis\n\nPlants make glucose from sunlight, water and carbon dioxide inside the chloroplasts.\n\n"
            "Respiration\n\nCells release energy from glucose in the mitochondria.")
    r = client.post("/api/upload-document", files={"file": ("bio.txt", text.encode())}).json()
    assert [t["topic_name"] for t in r["topics_found"]] == ["Photosynthesis", "Respiration"]
    bad = client.post("/api/upload-document", files={"file": ("x.docx", b"hello " * 20)})
    assert bad.status_code == 400


def test_gemini_outage_is_a_502_with_no_canned_content_and_no_partial_writes():
    client.post("/api/demo/seed")
    # a question whose wrong option has no stored misconception, so grading needs Gemini
    tid = db.one("SELECT id FROM topics WHERE topic_name = 'Recall'")["id"]
    qid = db.execute(
        "INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) VALUES (?, ?, ?, ?, ?, ?)",
        (tid, "Q?", db.dumps(["A. x", "B. y", "C. z", "D. w"]), "A", "because", "{}"))
    before = db.one("SELECT mastery_score FROM learner_mastery WHERE topic_id = ?", (tid,))["mastery_score"]
    GEMINI_DOWN["on"] = True

    r = client.post("/api/tutor/ask", json={"question": "what is recall"})
    assert r.status_code == 502 and "Gemini" in r.json()["error"] and "answer" not in r.json()
    assert client.post("/api/missions/generate", json={}).status_code == 502
    assert client.post("/api/upload-document", files={"file": ("n.txt", b"Heading\n\n" + b"word " * 30)}).status_code == 502

    s = client.post("/api/quiz/submit", json={"question_id": qid, "student_answer": "B", "confidence": 0.8})
    assert s.status_code == 502
    assert db.one("SELECT mastery_score FROM learner_mastery WHERE topic_id = ?", (tid,))["mastery_score"] == before
    assert db.one("SELECT COUNT(*) AS n FROM quiz_attempts WHERE question_id = ?", (qid,))["n"] == 0
