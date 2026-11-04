"""Today's goal: counted from real answers and flashcard ratings of the local day, and shown in /api/today."""
from datetime import datetime, timedelta, timezone

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.services import goal
from app.services.progress_data import local_today
from main import app  # noqa: F401
from tests.test_live import client


def stamp(moment):
    return moment.strftime("%Y-%m-%d %H:%M:%S")


@pytest.fixture
def student():
    made = client.post("/api/auth/signup", json={"email": "goal@example.com", "password": "longenough1"}).json()
    yield made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}
    accounts.erase_user(made["user"]["id"])


def topic_for(user_id):
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'n.txt')", (user_id,))
    return db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Paging')", (doc,))


def answer(user_id, topic, when):
    db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question_id, question, student_answer, is_correct, confidence, mastery_before, mastery_after, answered_at) "
               "VALUES (?, ?, NULL, 'q', 'A', 1, 0.5, 50, 52, ?)", (user_id, topic, stamp(when)))


def card(user_id, topic, when):
    db.execute("INSERT INTO flashcards (user_id, topic_id, front, back, source, box, reviewed_at) VALUES (?, ?, 'f', 'b', 'notes', 1, ?)",
               (user_id, topic, stamp(when)))


def test_progress_is_pure_and_caps_the_ring_not_the_count():
    assert goal.progress(0) == {"done": 0, "target": goal.DAILY_GOAL, "left": goal.DAILY_GOAL, "reached": False}
    assert goal.progress(goal.DAILY_GOAL)["reached"] is True
    assert goal.progress(goal.DAILY_GOAL + 3)["left"] == 0 and goal.progress(goal.DAILY_GOAL + 3)["done"] == goal.DAILY_GOAL + 3
    assert goal.progress(-2)["done"] == 0


def test_only_todays_answers_and_ratings_count(student):
    user_id, _ = student
    topic = topic_for(user_id)
    now = datetime.now(timezone.utc)
    answer(user_id, topic, now)
    card(user_id, topic, now)
    card(user_id, topic, now)
    answer(user_id, topic, now - timedelta(days=2))   # another day: not counted
    assert goal.actions_on(user_id, local_today()) == 3


def test_today_endpoint_reports_the_goal(student):
    user_id, headers = student
    topic = topic_for(user_id)
    for _ in range(goal.DAILY_GOAL):
        answer(user_id, topic, datetime.now(timezone.utc))
    out = client.get("/api/today", headers=headers).json()["goal"]
    assert out["done"] == goal.DAILY_GOAL and out["reached"] is True and out["left"] == 0
