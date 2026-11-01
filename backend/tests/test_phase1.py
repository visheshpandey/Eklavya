"""Phase 1 fixes: an absurd exam date never becomes a countdown, and YouTube notes get the video's real title."""
from datetime import date, timedelta

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.services import links, study_plan
from main import app  # noqa: F401  (creates the schema when this file runs on its own)
from tests.test_live import client


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "phase1@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}
    accounts.erase_user(made["user"]["id"])


def add_notes(user_id):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'n.txt')", (user_id,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Recall')", (doc,))
    db.execute("INSERT INTO learner_mastery (user_id, topic_id) VALUES (?, ?)", (user_id, topic))


def test_only_a_believable_exam_date_is_usable():
    today = date(2026, 11, 2)
    assert study_plan.usable_exam("2026-12-15", today) == date(2026, 12, 15)
    assert study_plan.usable_exam("2026-11-02", today) == today                                  # the exam is today
    assert study_plan.usable_exam("2221-04-01", today) is None                                    # the typo that gave "71334 days"
    assert study_plan.usable_exam("2026-10-01", today) is None                                    # already passed
    assert study_plan.usable_exam((today + timedelta(days=study_plan.MAX_EXAM_DAYS + 1)).isoformat(), today) is None
    assert [study_plan.usable_exam(x, today) for x in (None, "", "not a date", "0000-00-00")] == [None] * 4


def test_the_server_refuses_a_far_off_exam_date_with_a_clear_message(student):
    _, headers = student
    far = client.put("/api/plan", headers=headers, json={"exam_date": "2221-04-01", "minutes_per_day": 30})
    assert far.status_code == 400 and "three years" in far.json()["error"]
    soon = (date.today() + timedelta(days=40)).isoformat()
    assert client.put("/api/plan", headers=headers, json={"exam_date": soon, "minutes_per_day": 30}).status_code == 200


def test_a_bad_date_already_saved_shows_no_countdown_and_is_cleared(student):
    user_id, headers = student
    add_notes(user_id)
    db.execute("UPDATE users SET target_exam_date = '2221-04-01' WHERE id = ?", (user_id,))
    today = client.get("/api/today", headers=headers).json()
    assert today["exam_days_left"] is None and today["exam_date"] is None                          # no "71334 days" chip
    plan = client.get("/api/plan", headers=headers).json()
    assert plan["exam_date"] is None and plan["plan"] is None
    assert db.one("SELECT target_exam_date AS d FROM users WHERE id = ?", (user_id,))["d"] is None   # the typo is forgotten


def test_a_good_exam_date_still_counts_down(student):
    user_id, headers = student
    add_notes(user_id)
    db.execute("UPDATE users SET target_exam_date = ? WHERE id = ?", ((date.today() + timedelta(days=30)).isoformat(), user_id))
    assert client.get("/api/today", headers=headers).json()["exam_days_left"] in (29, 30, 31)     # the student's own calendar may differ by a day


class FakeResponse:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def test_a_video_gets_its_real_title_and_falls_back_to_its_id(monkeypatch):
    seen = {}

    def fake_get(url, params=None, **kw):
        seen["url"], seen["params"] = url, params
        return FakeResponse(200, {"title": "  Gradient   Descent, clearly explained  "})
    monkeypatch.setattr(links.requests, "get", fake_get)
    assert links.video_name("KufrEFHvZrM") == "Gradient Descent, clearly explained"
    assert seen["url"] == "https://www.youtube.com/oembed" and seen["params"]["format"] == "json"   # a fixed address, nothing from the student
    monkeypatch.setattr(links.requests, "get", lambda *a, **k: FakeResponse(404, {}))
    assert links.video_name("KufrEFHvZrM") == "YouTube video KufrEFHvZrM"
    monkeypatch.setattr(links.requests, "get", lambda *a, **k: (_ for _ in ()).throw(links.requests.ConnectionError("offline")))
    assert links.video_name("KufrEFHvZrM") == "YouTube video KufrEFHvZrM"
    monkeypatch.setattr(links.requests, "get", lambda *a, **k: FakeResponse(200, ValueError("not json")))
    assert links.video_name("KufrEFHvZrM") == "YouTube video KufrEFHvZrM"


def test_imported_video_notes_use_the_title_and_old_ones_are_renamed(student, monkeypatch):
    user_id, _ = student
    monkeypatch.setattr(links.requests, "get", lambda *a, **k: FakeResponse(200, {"title": "Backpropagation in 10 minutes"}))
    monkeypatch.setattr(links, "read_video", lambda url: "Backpropagation applies the chain rule backwards. " * 10)
    links._cache.clear()
    name, notes = links.notes_from_link("https://youtu.be/KufrEFHvZrM")
    assert name == "Backpropagation in 10 minutes" and notes
    old = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'YouTube video KufrEFHvZrM')", (user_id,))
    keep = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'My own notes.pdf')", (user_id,))
    assert links.fix_video_names() >= 1
    assert db.one("SELECT file_name AS n FROM documents WHERE id = ?", (old,))["n"] == "Backpropagation in 10 minutes"
    assert db.one("SELECT file_name AS n FROM documents WHERE id = ?", (keep,))["n"] == "My own notes.pdf"


def test_today_still_reports_the_last_session(student):
    """Today's "last session" needs the local-date helper: a missing import once made the whole screen a 500."""
    user_id, headers = student
    add_notes(user_id)
    db.execute("INSERT INTO voice_sessions (user_id, mode, language, study_mode, turns) VALUES (?, 'gemini-live', 'english', 'learn', 4)", (user_id,))
    today = client.get("/api/today", headers=headers)
    assert today.status_code == 200 and today.json()["last_session"]["mode"] == "learn"
