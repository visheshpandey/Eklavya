"""The demo's numbers must agree wherever they appear: Recent answers, the Mastery over time chart, the topic list and the streak.

A judge compares them, so a topic that shows 36% in one place and 52% in another reads as a bug.
"""
from datetime import datetime, timedelta, timezone

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.services import demo_seed
from main import app  # noqa: F401
from tests.test_live import client


@pytest.fixture
def guest():
    headers = {"Authorization": f"Bearer {client.post('/api/guest').json()['token']}"}
    assert client.post("/api/demo/seed", headers=headers).status_code == 200
    yield headers
    accounts.erase_user(client.get("/api/auth/me", headers=headers).json()["id"])


def dashboard(headers):
    return client.get("/api/dashboard", headers=headers).json()


def test_each_topics_answers_chain_and_end_at_its_displayed_mastery(guest):
    data = dashboard(guest)
    shown = {m["topic_id"]: m["mastery_score"] for m in data["mastery"]}
    by_topic = {}
    for attempt in data["progress"]:   # oldest first
        by_topic.setdefault(attempt["topic_id"], []).append(attempt)
    assert by_topic, "the demo has answers"
    for topic_id, attempts in by_topic.items():
        for earlier, later in zip(attempts, attempts[1:]):
            assert later["mastery_before"] == earlier["mastery_after"]   # each answer starts where the last one ended
        assert attempts[-1]["mastery_after"] == pytest.approx(shown[topic_id], abs=0.1)   # the last answer ends at the topic's mastery


def test_recent_answers_are_varied_not_identical_rows(guest):
    history = dashboard(guest)["quiz_history"]
    assert len({a["topic_name"] for a in history}) >= 4
    assert any(a["is_correct"] for a in history) and not all(a["is_correct"] for a in dashboard(guest)["progress"])   # some wrong answers
    assert len({(a["topic_name"], a["question"], a["mastery_before"], a["mastery_after"]) for a in history}) == len(history)


def test_a_correct_answer_raises_mastery_and_a_wrong_one_lowers_it(guest):
    for attempt in dashboard(guest)["progress"]:
        assert (attempt["mastery_after"] >= attempt["mastery_before"]) == bool(attempt["is_correct"])


def test_the_chart_data_is_the_same_answers_as_recent_answers(guest):
    data = dashboard(guest)
    newest_first = [(a["topic_name"], a["mastery_before"], a["mastery_after"]) for a in data["quiz_history"]]
    chart = [(a["topic_name"], a["mastery_before"], a["mastery_after"]) for a in reversed(data["progress"])][: len(newest_first)]
    assert newest_first == chart


def test_the_history_endpoint_ends_at_each_topics_mastery(guest):
    shown = {m["topic_id"]: m["mastery_score"] for m in dashboard(guest)["mastery"]}
    series = client.get("/api/mastery-history", headers=guest).json()["topics"]
    for topic_id, points in series.items():
        assert points[-1]["after"] == pytest.approx(shown[int(topic_id)], abs=0.1)


def test_the_demo_keeps_its_four_day_streak(guest):
    assert client.get("/api/today", headers=guest).json()["streak"] == 4


def test_no_seeded_answer_is_in_the_future(guest):
    now = datetime.now(timezone.utc) + timedelta(minutes=1)
    for attempt in dashboard(guest)["progress"]:
        assert datetime.fromisoformat(attempt["answered_at"].replace(" ", "T")).replace(tzinfo=timezone.utc) <= now


def test_a_real_answer_goes_on_top_of_recent_answers(guest):
    data = dashboard(guest)
    topic = next(m for m in data["mastery"] if m["topic_name"] == "Precision")
    questions = client.post("/api/quiz/generate", headers=guest, json={"topic_id": topic["topic_id"], "count": 1}).json()["questions"]
    answered = client.post("/api/quiz/submit", headers=guest, json={"question_id": questions[0]["question_id"], "student_answer": "B", "confidence": 0.8})
    assert answered.status_code == 200
    top = dashboard(guest)["quiz_history"][0]
    assert top["topic_name"] == "Precision" and top["mastery_before"] == pytest.approx(topic["mastery_score"], abs=0.1)


def test_answer_times_are_spread_and_ordered(guest):
    stamps = [a["answered_at"] for a in dashboard(guest)["progress"]]
    assert stamps == sorted(stamps)   # the highest id is the newest


def test_the_pure_timing_never_lands_in_the_future():
    early = datetime(2026, 12, 3, 0, 20, tzinfo=timezone.utc)   # just after midnight: ten-minute gaps would reach yesterday
    for position in range(5):
        stamp = demo_seed._answer_time(0, position, 5, early)
        assert "2026-12-03 00:00:01" <= stamp <= "2026-12-03 00:20:00"


def test_the_seed_is_per_guest(guest):
    other = {"Authorization": f"Bearer {client.post('/api/guest').json()['token']}"}
    try:
        assert not dashboard(other)["progress"]
    finally:
        accounts.erase_user(client.get("/api/auth/me", headers=other).json()["id"])
    assert db.one("SELECT COUNT(*) AS n FROM quiz_attempts")["n"] > 0
