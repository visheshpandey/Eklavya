"""Several notes documents at once: grouped dashboard, scoped tutoring, search across notes, removal."""
import pytest
from fastapi.testclient import TestClient

from app import db
from app.ai import gemini, live
from app.domain import retrieval
from app.services.documents import delete_document
from main import app
from test_live import FakeSession, call, collect, fake_connect, sc

client = TestClient(app)

BIO = ("Photosynthesis\n\nPlants make glucose from sunlight, water and carbon dioxide inside the chloroplasts.\n\n"
       "Respiration\n\nCells release energy from glucose in the mitochondria.")


def fake_topics(system, prompt, required_keys=(), temperature=0.7, **_):
    if "topic structure" in system:
        return {"success": True, "data": {"topics": ["Photosynthesis", "Respiration"]}}
    return {"success": False, "error": "unexpected call in test"}


@pytest.fixture()
def two_documents(monkeypatch):
    """The demo ML notes (older) plus a biology upload (newer)."""
    monkeypatch.setattr(gemini, "call_llm_json", fake_topics)
    for leftover in db.query("SELECT id FROM documents WHERE user_id = 1"):      # start from an empty library
        delete_document(1, leftover["id"])
    client.post("/api/demo/seed")
    bio = client.post("/api/upload-document", files={"file": ("bio.txt", BIO.encode())}).json()
    demo_id = db.one("SELECT id FROM documents WHERE file_name = 'ml_notes.txt' ORDER BY id DESC")["id"]
    return {"demo": demo_id, "bio": bio["document_id"]}


def topic_id(name):
    return db.one("SELECT id FROM topics WHERE topic_name = ? ORDER BY id DESC", (name,))["id"]


def test_dashboard_groups_topics_by_document_newest_first(two_documents):
    mastery = client.get("/api/dashboard").json()["mastery"]
    docs_in_order = list(dict.fromkeys(m["document"] for m in mastery))
    assert docs_in_order == ["bio.txt", "ml_notes.txt"]
    assert {m["document_id"] for m in mastery} == set(two_documents.values())
    assert [m["topic_name"] for m in mastery if m["document"] == "bio.txt"] == ["Photosynthesis", "Respiration"]


def test_search_scopes_to_one_document_or_all_notes(two_documents):
    only_bio = retrieval.retrieve(two_documents["bio"], "precision recall")
    assert only_bio == []                                              # not in the biology notes
    everywhere = retrieval.retrieve_for_user(1, "chloroplasts glucose")
    assert everywhere and everywhere[0]["document"] == "bio.txt"
    ml = retrieval.retrieve_for_user(1, "precision false positives")
    assert ml and ml[0]["document"] == "ml_notes.txt" and ml[0]["topic"] == "Precision"


def test_text_tutor_answers_from_any_of_the_notes(two_documents, monkeypatch):
    def tutor(system, prompt, required_keys=(), temperature=0.7):
        return {"success": True, "data": {"answer": "ok", "follow_up_question": "?", "source_topic": "x"}}
    monkeypatch.setattr(gemini, "call_llm_json", tutor)
    ml = client.post("/api/tutor/ask", json={"question": "what is precision"}).json()
    bio = client.post("/api/tutor/ask", json={"question": "what do chloroplasts do"}).json()
    assert ml["grounded"] and ml["source_document"] == two_documents["demo"]
    assert bio["grounded"] and bio["source_document"] == two_documents["bio"]


def test_learning_an_older_topic_uses_that_topics_own_notes(two_documents, monkeypatch):
    """The newest upload must not hijack a lesson on an older document's topic."""
    tid = topic_id("Precision")                                        # belongs to the OLDER (demo) document
    fake = FakeSession([[call("search_notes", {"query": "precision"}, "s1"), sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect(f"/ws/voice?mode=learn&topic_id={tid}") as ws:
        ev, _ = collect(ws)
    assert not any(e["type"] == "error" for e in ev)
    assert 'Topic: "Precision"' in fake.system_prompt
    results = fake.tool_responses[0].response["results"]
    assert {r["document"] for r in results} == {"ml_notes.txt"}


def test_free_conversation_knows_topics_from_every_document(two_documents, monkeypatch):
    fake = FakeSession([[call("search_notes", {"query": "chloroplasts"}, "s1"), sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect("/ws/voice") as ws:
        collect(ws)
    assert "Precision" in fake.system_prompt and "Photosynthesis" in fake.system_prompt
    assert fake.tool_responses[0].response["results"][0]["document"] == "bio.txt"


def test_removing_a_document_removes_its_topics_and_progress_only(two_documents):
    # make some progress on both documents
    for name in ("Precision", "Photosynthesis"):
        tid = topic_id(name)
        db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question_id, question, student_answer, is_correct, confidence, mastery_before, mastery_after) "
                   "VALUES (1, ?, 1, 'q', 'A', 0, 0.5, 50, 45)", (tid,))
        db.execute("INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity) VALUES (1, ?, 'm', 'definition_mixup', 'high')", (tid,))

    assert client.delete(f"/api/documents/{two_documents['bio']}").json() == {"deleted": two_documents["bio"]}

    d = client.get("/api/dashboard").json()
    assert {m["document"] for m in d["mastery"]} == {"ml_notes.txt"}               # biology is gone, ML stays
    assert not db.one("SELECT 1 AS x FROM chunks WHERE document_id = ?", (two_documents["bio"],))
    assert not db.one("SELECT 1 AS x FROM topics WHERE document_id = ?", (two_documents["bio"],))
    assert not db.one("SELECT 1 AS x FROM quiz_attempts a JOIN topics t ON t.id = a.topic_id WHERE t.document_id = ?", (two_documents["bio"],))
    assert db.one("SELECT 1 AS x FROM quiz_attempts a JOIN topics t ON t.id = a.topic_id WHERE t.topic_name = 'Precision'")   # ML progress untouched
    assert all(a["topic"] != "Photosynthesis" for a in d["alerts"])


def test_removing_unknown_or_foreign_documents_is_a_404(two_documents):
    assert client.delete("/api/documents/999999").status_code == 404
    other = db.execute("INSERT INTO documents (user_id, file_name) VALUES (2, 'theirs.txt')")
    assert client.delete(f"/api/documents/{other}").status_code == 404                 # belongs to another student


def test_loading_the_demo_again_keeps_the_students_own_uploads(two_documents):
    client.post("/api/demo/seed")
    names = {m["document"] for m in client.get("/api/dashboard").json()["mastery"]}
    assert names == {"ml_notes.txt", "bio.txt"}
    assert db.one("SELECT COUNT(*) AS n FROM documents WHERE file_name = 'ml_notes.txt'")["n"] == 1   # replaced, not duplicated
