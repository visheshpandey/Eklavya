"""Whiteboards are saved the moment they are drawn, and "today" follows the student's calendar, not the server's."""
from datetime import date

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.services import history, progress_data
from main import app  # noqa: F401  (creates the schema when this file runs on its own)
from tests.test_live import FakeSession, call, client, collect, fake_connect, fake_text_gemini, sc


def test_a_late_evening_utc_time_is_already_tomorrow_in_india():
    stamp = "2026-10-28 20:30:00"   # 02:00 on the 29th in India
    progress_data.use_timezone("Asia/Kolkata")
    assert progress_data.local_date(stamp) == date(2026, 10, 29)
    progress_data.use_timezone("UTC")
    assert progress_data.local_date(stamp) == date(2026, 10, 28)
    progress_data.use_timezone("Not/AZone")                         # an unknown name falls back to the server's setting, never crashes
    assert progress_data.local_date(stamp) == date(2026, 10, 29)    # APP_TIMEZONE defaults to Asia/Kolkata
    progress_data.use_timezone(None)


def test_whiteboards_of_today_use_the_students_calendar(monkeypatch):
    user = db.execute("INSERT INTO users (name, email) VALUES ('Tz', 'tz@example.com')")
    db.execute("INSERT INTO boards (user_id, topic_id, title, kind, data, created_at) VALUES (?, NULL, 'Precision', 'formula', '{\"title\": \"Precision\"}', '2026-10-28 20:30:00')", (user,))
    monkeypatch.setattr(history, "local_today", lambda: date(2026, 10, 29))
    try:
        progress_data.use_timezone("Asia/Kolkata")
        assert [b["title"] for b in history.boards_today(user)] == ["Precision"]
        progress_data.use_timezone("UTC")
        assert history.boards_today(user) == []
    finally:
        progress_data.use_timezone(None)
        accounts.erase_user(user)


def test_the_browsers_timezone_header_is_accepted_and_a_bad_one_is_harmless():
    assert client.get("/api/today", headers={"X-Timezone": "Asia/Kolkata"}).status_code == 200
    assert client.get("/api/today", headers={"X-Timezone": "Mars/Olympus"}).status_code == 200


def test_a_whiteboard_drawn_in_a_quick_revision_is_saved_and_listed_for_the_study_pack(monkeypatch):
    from app.ai import gemini, live
    monkeypatch.setattr(gemini, "call_llm_json", fake_text_gemini)
    client.post("/api/demo/seed")
    precision = db.one("SELECT t.id FROM topics t JOIN documents d ON d.id = t.document_id "
                       "WHERE t.topic_name = 'Precision' AND d.user_id = 1")["id"]   # the demo student's, not a leftover from another test
    board = {"kind": "formula", "title": "Precision", "formula": "TP / (TP + FP)", "items": ["TP: caught spam", "FP: good mail flagged"], "result": "8 / 10 = 80%"}
    fake = FakeSession([[call("search_notes", {"query": "precision"}, "a"), call("show_board", board, "b")], [sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect(f"/ws/voice?mode=revise&topic_id={precision}") as ws:
        events, _ = collect(ws)
    assert any(e["type"] == "board" and e["title"] == "Precision" for e in events)
    saved = client.get("/api/boards", headers={"X-Timezone": "Asia/Kolkata"}).json()["boards"]
    assert any(b["title"] == "Precision" for b in saved)   # in the list the study pack prints, even though the call just ended
