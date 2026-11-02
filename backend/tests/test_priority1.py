"""Priority 1: real titles for notes, mastery that comes from evidence (and fades), and the history behind the sparklines."""
from datetime import date, timedelta

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.domain import mastery as m
from app.domain import titles
from app.services import mastery_log, retitle
from main import app  # noqa: F401
from tests.test_live import client


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "p1@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}
    accounts.erase_user(made["user"]["id"])


def add_topic(user_id, file_name="notes.txt", topic="Precision", text="Precision is TP over TP plus FP."):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (user_id, file_name))
    topic_id = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc, topic))
    db.execute("INSERT INTO learner_mastery (user_id, topic_id) VALUES (?, ?)", (user_id, topic_id))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, ?, ?)", (doc, topic_id, "", text))
    return doc, topic_id


# ---- titles
def test_weak_names_are_recognised():
    for name in ("page", "n.txt", "Page", "index.pdf", "dQw4w9WgXcQ", "IMG_2041.jpg", "pasted-notes.txt", "12345"):
        assert titles.is_weak(name), name
    for name in ("Process Scheduling", "ml_notes.txt", "DBMS Unit 2.pdf"):
        assert not titles.is_weak(name), name


def test_title_follows_the_documented_order():
    assert titles.best_title("page", "# Precision and Recall Trade-offs\nbody") == "Precision and Recall Trade-offs"
    assert titles.best_title("scan.pdf", "x", metadata_title="Operating Systems Notes") == "Operating Systems Notes"
    assert titles.best_title("page", "a long first sentence that is not a heading at all, it just keeps going.", model_title="Deadlock Basics") == "Deadlock Basics"
    assert titles.best_title("OS_unit2.pdf", "a long sentence that is not a heading, it goes on and on and on.") == "OS unit2"
    assert titles.best_title("What is a deadlock? | Gate Smashers", "text", name_first=True) == "What is a deadlock? | Gate Smashers"


def test_kinds_and_link_normalising():
    assert [titles.kind_for(n) for n in ("a.pdf", "a.txt", "a.jpg", "YouTube video abc")] == ["pdf", "text", "photo", "youtube"]
    assert titles.kind_for("x", "https://example.com/a") == "link"
    assert titles.normalise_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9") == titles.normalise_url("https://youtu.be/dQw4w9WgXcQ")
    assert titles.normalise_url("https://Example.com/a/?utm_source=x") == titles.normalise_url("http://example.com/a")


def test_old_notes_get_real_titles_and_duplicate_links_merge(student):
    user_id, _ = student
    doc, _topic = add_topic(user_id, "page", text="# Deadlocks and Prevention\nA deadlock needs four conditions.")
    first, _ = add_topic(user_id, "Same video", topic="A")
    second, _ = add_topic(user_id, "Same video", topic="B")
    db.execute("UPDATE documents SET source_kind = 'youtube' WHERE id IN (?, ?)", (first, second))
    result = retitle.retitle_existing()
    assert db.one("SELECT file_name, source_kind FROM documents WHERE id = ?", (doc,)) == {"file_name": "Deadlocks and Prevention", "source_kind": "text"}
    assert result["merged"] == 1 and db.one("SELECT id FROM documents WHERE id = ?", (second,)) is None


# ---- mastery
def test_cards_move_mastery_the_right_way():
    assert m.card_update(40, "known") > 40 and m.card_update(40, "hard") > 40 and m.card_update(40, "again") < 40
    assert m.card_update(40, "known") > m.card_update(40, "hard")
    assert 0 <= m.card_update(99.5, "known") <= 100 and m.card_update(1, "again") == 0


def test_marked_performance_moves_toward_the_score():
    assert m.marked_update(40, 90) > 40 and m.marked_update(80, 30) < 80 and m.marked_update(50, 50) == 50


def test_unpractised_topics_fade_but_never_vanish():
    assert m.faded(80, 0, 3) == 80
    assert m.faded(80, 5, 1) < 80 and m.faded(80, 60, 1) < m.faded(80, 5, 1)
    assert m.faded(80, 400, 1) >= 80 * m.FADE_FLOOR - 0.1
    assert m.faded(80, 14, 8) > m.faded(80, 14, 1)          # more evidence: the memory lasts longer
    assert m.faded(50, 30, 0) == 50                          # no evidence, nothing to fade


def test_a_new_topic_is_not_started_until_evidence_exists(student):
    user_id, headers = student
    _doc, topic = add_topic(user_id)
    row = client.get("/api/dashboard", headers=headers).json()["mastery"][0]
    assert row["started"] is False and row["evidence"] == 0
    assert client.get("/api/dashboard", headers=headers).json()["weak_topics"] == []   # not started is not weak
    db.execute("INSERT INTO flashcards (user_id, topic_id, front, back) VALUES (?, ?, 'q', 'a')", (user_id, topic))
    card = db.one("SELECT id FROM flashcards WHERE user_id = ?", (user_id,))["id"]
    result = client.post(f"/api/flashcards/{card}/review", headers=headers, json={"knew": True}).json()
    assert result["mastery"]["after"] > result["mastery"]["before"] and result["mastery"]["topic"] == "Precision"
    row = client.get("/api/dashboard", headers=headers).json()["mastery"][0]
    assert row["started"] is True and row["mastery_score"] == pytest.approx(result["mastery"]["after"], abs=0.2)


def test_again_lowers_mastery_and_history_lists_every_step(student):
    user_id, headers = student
    _doc, topic = add_topic(user_id)
    db.execute("INSERT INTO flashcards (user_id, topic_id, front, back) VALUES (?, ?, 'q', 'a')", (user_id, topic))
    card = db.one("SELECT id FROM flashcards WHERE user_id = ?", (user_id,))["id"]
    client.post(f"/api/flashcards/{card}/review", headers=headers, json={"knew": True})
    down = client.post(f"/api/flashcards/{card}/review", headers=headers, json={"knew": False}).json()["mastery"]
    assert down["delta"] < 0
    points = client.get("/api/mastery-history", headers=headers).json()["topics"][str(topic)]
    assert [p["source"] for p in points] == ["flashcard", "flashcard"] and points[0]["after"] > points[1]["after"]


def test_old_evidence_fades_the_shown_mastery_but_not_the_stored_one(student):
    user_id, headers = student
    _doc, topic = add_topic(user_id)
    db.execute("UPDATE learner_mastery SET mastery_score = 80, last_updated = ? WHERE user_id = ? AND topic_id = ?",
               ((date.today() - timedelta(days=30)).isoformat() + " 08:00:00", user_id, topic))
    mastery_log.record(user_id, topic, "quiz", 70, 80, at=(date.today() - timedelta(days=30)).isoformat() + " 08:00:00")
    row = client.get("/api/dashboard", headers=headers).json()["mastery"][0]
    assert row["mastery_stored"] == 80 and row["mastery_score"] < 80


# ---- the demo fixture
def test_the_demo_has_real_titles_varied_mastery_a_streak_and_due_cards():
    seeded = client.post("/api/demo/seed").json()
    assert [d["title"] for d in seeded["documents"]] == ["Operating Systems Notes", "DBMS Notes", "Machine Learning Notes"]
    titles_ = {d["title"] for d in seeded["documents"]}
    rows = [r for r in client.get("/api/dashboard").json()["mastery"] if r["document"] in titles_]   # other tests may leave their own notes for the same student
    scores = sorted(r["mastery_score"] for r in rows)
    assert scores[0] < 40 and scores[-1] >= 85 and all(r["started"] for r in rows)                  # some in the 30s, some 85 and up
    assert {r["source_kind"] for r in rows} == {"pdf", "text"}
    today = client.get("/api/today").json()
    assert today["streak"] >= 4 and today["cards_due"] >= 5   # at least the 4 seeded days (other tests may add activity for the same student)
    history = client.get("/api/mastery-history").json()["topics"]
    assert sum(1 for points in history.values() if len(points) >= 3) >= 8                            # a week behind most topics
    assert len(client.get("/api/flashcards/due").json()["cards"]) == today["cards_due"]


def test_the_demo_cannot_be_loaded_into_a_real_account(student):
    _, headers = student
    refused = client.post("/api/demo/seed", headers=headers)
    assert refused.status_code == 403 and "demo mode" in refused.json()["error"]
    assert client.get("/api/dashboard", headers=headers).json()["mastery"] == []


def test_the_demo_circle_is_served_from_the_fixture():
    circle = client.get("/api/demo/circle").json()
    assert [f["name"] for f in circle["friends"]] == ["Aarav", "Riya", "Meera"] and circle["shared_notes"]


# ---- the impact estimate
def test_the_monthly_cost_is_computed_from_the_configured_models_and_shows_its_formula():
    from app.config import settings
    data = client.get("/api/impact").json()
    assert data["models"] == {"text": settings.gemini_model, "live": settings.gemini_live_model, "embedding": settings.gemini_embed_model, "voice": settings.live_voice}
    assert abs(sum(line["usd"] for line in data["lines"]) - data["total_usd"]) < 0.02
    assert all("=" in line["formula"] or "x" in line["formula"] for line in data["lines"]) and data["voice_is_the_bulk"] and "assumptions" in data["verify"]


# ---- Ask: only relevant citations
def test_citations_drop_passages_that_are_far_off_or_off_topic():
    from app.domain import retrieval
    q = "Deadlock ke 4 conditions kya hain?"
    deadlock = {"text": "A deadlock needs four conditions: mutual exclusion, hold and wait, no preemption and circular wait.", "topic": "OS: Deadlocks", "heading": "Deadlocks", "score": 4.0}
    more = {"text": "Breaking any one of the deadlock conditions prevents deadlock.", "topic": "OS: Deadlocks", "heading": "Deadlocks", "score": 2.5}
    dbms = {"text": "A transaction is a group of operations that succeed or fail as one unit. ACID describes its guarantees.", "topic": "DBMS: Transactions and ACID", "heading": "Transactions", "score": 0.9}
    close_but_other_topic = {"text": "Durability means a committed change survives a crash.", "topic": "DBMS: Transactions and ACID", "heading": "Transactions", "score": 3.0}
    assert retrieval.relevant_sources(q, [deadlock, more, dbms]) == [deadlock, more]
    assert retrieval.relevant_sources(q, [deadlock, close_but_other_topic]) == [deadlock]      # a good score is not enough without sharing the question's words or topic
    many = [{**deadlock, "score": 4.0 - i * 0.1} for i in range(6)]
    assert len(retrieval.relevant_sources(q, many)) == 3 and retrieval.relevant_sources(q, []) == []
