"""Tutor choice, doubt history, mock exams, badges, study groups and friend challenges."""
import json
from datetime import date, timedelta

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest
from fastapi.testclient import TestClient

from app import accounts, db
from app.agents import mock_exam, voice_tutor
from app.ai import live
from app.config import settings
from app.domain import badges as badge_rules
from main import app

client = TestClient(app)
OPTIONS = ["A. one", "B. two", "C. three", "D. four"]


@pytest.fixture(autouse=True)
def erase_test_accounts():
    yield
    for row in db.query("SELECT id FROM users WHERE id != ?", (settings.demo_user_id,)):
        accounts.erase_user(row["id"])


def signup(email):
    made = client.post("/api/auth/signup", json={"name": email.split("@")[0], "email": email, "password": "longenough1"}).json()
    return made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}


def give_notes(user_id, topics=("Recall", "Precision"), questions=3):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (user_id, "notes.txt"))
    ids = []
    for name in topics:
        topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc, name))
        db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, ?, ?)", (doc, topic, name, f"{name} notes"))
        for n in range(questions):
            db.execute("INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) "
                       "VALUES (?, ?, ?, 'A', 'because', ?)",
                       (topic, f"{name} question {n}?", json.dumps(OPTIONS), json.dumps({"B": {"label": "Overgeneralisation", "text": "wrong"}})))
        ids.append(topic)
    return doc, ids


# ---------------------------------------------------------------- tutor choice
def test_each_tutor_has_its_own_voice_and_personality():
    mentor = live.build_system_prompt("english", [], tutor="mentor")
    senior = live.build_system_prompt("english", [], tutor="senior")
    assert "Calm mentor" in mentor and "Friendly senior" in senior
    assert live.voice_for("senior") != live.voice_for("mentor") and live.voice_for("mentor") == settings.live_voice
    assert "Calm mentor" in live.build_system_prompt("english", [], tutor="nonsense")   # unknown choice falls back safely


# ---------------------------------------------------------------- doubts
def test_doubts_are_saved_searched_and_deleted(monkeypatch):
    user_id, headers = signup("doubts@example.com")
    give_notes(user_id)
    monkeypatch.setattr(voice_tutor, "search", lambda *a, **k: [{"topic": "Recall", "heading": "h", "text": "t", "document_id": 1, "score": 1}])
    prompts_seen = []

    def fake_llm(system, prompt, **kwargs):
        prompts_seen.append(prompt)
        return {"answer": "Recall is TP over TP+FN.", "follow_up_question": "Why?", "source_topic": "Recall"}
    monkeypatch.setattr(voice_tutor, "llm_json", fake_llm)

    first = client.post("/api/tutor/ask", headers=headers, json={"question": "What is recall?"}).json()
    client.post("/api/tutor/ask", headers=headers, json={"question": "and precision?"})
    assert "Earlier in this chat" in prompts_seen[1] and "Student: What is recall?" in prompts_seen[1]
    assert "Earlier in this chat" not in prompts_seen[0]   # a follow-up sees the chat so far
    listed = client.get("/api/doubts", headers=headers).json()
    assert listed["total"] == 2 and listed["doubts"][0]["question"] == "and precision?"
    assert client.get("/api/doubts?q=RECALL", headers=headers).json()["doubts"]
    assert client.get("/api/doubts?q=zebra", headers=headers).json()["doubts"] == []
    assert client.delete(f"/api/doubts/{first['doubt_id']}", headers=headers).status_code == 200
    assert client.get("/api/doubts", headers=headers).json()["total"] == 1
    other_id, other = signup("other-doubts@example.com")
    assert client.get("/api/doubts", headers=other).json()["total"] == 0            # nobody else's doubts
    assert client.delete(f"/api/doubts/{first['doubt_id']}", headers=other).status_code in (404,)


# ---------------------------------------------------------------- mock exam
def test_mock_exam_grades_and_reports_by_topic():
    user_id, headers = signup("mock@example.com")
    give_notes(user_id)
    exam = client.post("/api/mock-exam/start", headers=headers, json={"count": 4, "minutes": 10}).json()
    assert exam["total"] == 4 and all("correct" not in q for q in exam["questions"])
    answers = {str(q["position"]): "A" for q in exam["questions"][:3]}   # three right, one left blank
    report = client.post(f"/api/mock-exam/{exam['exam_id']}/submit", headers=headers, json={"answers": answers}).json()
    assert report["correct"] == 3 and report["answered"] == 3 and report["percent"] == 75
    assert {t["topic"] for t in report["topics"]} == {"Recall", "Precision"}
    again = client.post(f"/api/mock-exam/{exam['exam_id']}/submit", headers=headers, json={"answers": {}}).json()
    assert again["correct"] == 3                                                    # handing in twice changes nothing
    assert client.get("/api/mock-exams", headers=headers).json()["exams"][0]["percent"] == 75
    assert client.get(f"/api/mock-exam/{exam['exam_id']}", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_late_mock_exam_answers_are_not_graded():
    user_id, headers = signup("late@example.com")
    give_notes(user_id)
    exam = client.post("/api/mock-exam/start", headers=headers, json={"count": 3, "minutes": 3}).json()
    db.execute("UPDATE mock_exams SET started_at = ? WHERE id = ?", ((date.today() - timedelta(days=1)).isoformat() + " 00:00:00", exam["exam_id"]))
    report = client.post(f"/api/mock-exam/{exam['exam_id']}/submit", headers=headers,
                         json={"answers": {str(q["position"]): "A" for q in exam["questions"]}}).json()
    assert report["correct"] == 0


def test_mock_exam_needs_notes():
    _, headers = signup("nonotes@example.com")
    assert client.post("/api/mock-exam/start", headers=headers, json={}).status_code == 400


# ---------------------------------------------------------------- badges
def test_badge_rules():
    assert badge_rules.longest_streak([]) == 0
    days = [date(2026, 1, d) for d in (1, 2, 3, 7, 8)]
    assert badge_rules.longest_streak(days) == 3
    earned = {b["id"]: b for b in badge_rules.evaluate({"documents": 1, "best_streak": 3, "correct": 20})}
    assert earned["first-notes"]["earned"] and earned["streak-3"]["earned"] and not earned["streak-7"]["earned"]
    assert earned["sharp-50"]["progress"] == 20 and earned["sharp-50"]["goal"] == 50


def test_badges_follow_real_activity():
    user_id, headers = signup("badge@example.com")
    assert client.get("/api/badges", headers=headers).json()["earned"] == 0
    give_notes(user_id)
    got = client.get("/api/badges", headers=headers).json()
    assert got["earned"] == 1 and got["total"] == len(badge_rules.BADGES)


# ---------------------------------------------------------------- study groups
def test_groups_share_notes_and_rank_members():
    owner_id, owner = signup("owner@example.com")
    friend_id, friend = signup("friend@example.com")
    doc, topics = give_notes(owner_id)
    group = client.post("/api/groups", headers=owner, json={"name": "Exam squad"}).json()
    assert len(group["code"]) == 6
    joined = client.post("/api/groups/join", headers=friend, json={"code": group["code"].lower()}).json()
    assert [m["name"] for m in joined["leaderboard"]].count("friend") == 1
    assert client.post("/api/groups/join", headers=friend, json={"code": "ZZZZZZ"}).status_code == 404

    assert client.post(f"/api/groups/{group['id']}/notes", headers=owner, json={"document_id": doc}).json()["notes"][0]["file_name"] == "notes.txt"
    assert client.post(f"/api/groups/{group['id']}/notes", headers=friend, json={"document_id": doc}).status_code == 404   # not their notes
    added = client.post(f"/api/groups/{group['id']}/notes/{doc}/add", headers=friend).json()
    assert added["topics"] == 2 and not added["already"]
    assert client.post(f"/api/groups/{group['id']}/notes/{doc}/add", headers=friend).json()["already"]
    mine = db.query("SELECT t.id FROM topics t JOIN documents d ON d.id = t.document_id WHERE d.user_id = ?", (friend_id,))
    assert len(mine) == 2
    assert db.query("SELECT q.id FROM quiz_questions q WHERE q.topic_id IN (%s)" % ",".join(str(m["id"]) for m in mine))   # questions came too

    owner_card = next(r for r in client.get(f"/api/groups/{group['id']}", headers=owner).json()["leaderboard"] if r["you"])
    assert owner_card["name"] == "owner"
    outsider_id, outsider = signup("outsider@example.com")
    assert client.get(f"/api/groups/{group['id']}", headers=outsider).status_code == 404

    left = client.delete(f"/api/groups/{group['id']}/members/me", headers=owner).json()
    assert left["groups"] == []
    assert db.one("SELECT owner_id FROM study_groups WHERE id = ?", (group["id"],))["owner_id"] == friend_id   # ownership moved on
    assert not db.query("SELECT id FROM group_documents WHERE group_id = ?", (group["id"],))                   # owner's shared notes unshared


def test_the_demo_student_cannot_join_groups():
    assert client.post("/api/groups", json={"name": "x"}).status_code == 400


def test_leaderboard_counts_this_weeks_work():
    user_id, headers = signup("points@example.com")
    _, topics = give_notes(user_id)
    for correct in (1, 1, 0):
        db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question_id, question, student_answer, is_correct) VALUES (?, ?, 1, 'q', 'A', ?)",
                   (user_id, topics[0], correct))
    group = client.post("/api/groups", headers=headers, json={"name": "Solo"}).json()
    assert group["leaderboard"][0]["points"] == 2 * 10 + 2


# ---------------------------------------------------------------- challenges
def test_challenge_a_friend():
    owner_id, owner = signup("c-owner@example.com")
    friend_id, friend = signup("c-friend@example.com")
    _, topics = give_notes(owner_id, topics=("Recall",), questions=5)
    made = client.post("/api/challenges", headers=owner, json={"topic_id": topics[0]}).json()
    code = made["code"]
    assert made["total"] == 5 and not made["played"] and made["standings"] == []

    page = client.get(f"/api/challenges/{code}", headers=friend).json()          # a friend needs no notes of their own
    assert page["topic"] == "Recall" and all("correct" not in q for q in page["questions"])
    done = client.post(f"/api/challenges/{code}/play", headers=owner, json={"answers": {"1": "A", "2": "B"}, "seconds": 40}).json()
    assert done["standings"][0]["correct"] == 1 and "review" in done
    client.post(f"/api/challenges/{code}/play", headers=friend, json={"answers": {str(i): "A" for i in range(1, 6)}, "seconds": 60})
    board = client.get(f"/api/challenges/{code}/result", headers=friend).json()["standings"]
    assert [(r["name"], r["correct"]) for r in board] == [("c-friend", 5), ("c-owner", 1)]
    assert client.get("/api/badges", headers=friend).json()["badges"][-1]["earned"]   # the challenger badge
    again = client.post(f"/api/challenges/{code}/play", headers=friend, json={"answers": {}, "seconds": 1}).json()
    assert again["standings"][0]["correct"] == 5                                      # one try each
    assert client.get("/api/challenges/NOPE99", headers=friend).status_code == 404
