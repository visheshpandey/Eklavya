"""Feedback: three questions, one answer per student, and a summary that stays empty until there is enough to say."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from main import app  # noqa: F401
from tests.test_live import client


def make_student(n):
    made = client.post("/api/auth/signup", json={"email": f"fb{n}@example.com", "password": "longenough1"}).json()
    return made["user"]["id"], {"Authorization": f"Bearer {made['token']}"}


@pytest.fixture(autouse=True)
def clean():
    db.execute("DELETE FROM feedback")
    yield
    db.execute("DELETE FROM feedback")


def test_save_and_once_per_student():
    uid, auth_h = make_student(1)
    try:
        assert client.get("/api/feedback/mine", headers=auth_h).json() == {"given": False}
        assert client.post("/api/feedback", json={"easier": "yes", "trust": "yes", "rating": 5}, headers=auth_h).status_code == 200
        assert client.post("/api/feedback", json={"easier": "no", "trust": "no", "rating": 2}, headers=auth_h).status_code == 200
        assert client.get("/api/feedback/mine", headers=auth_h).json() == {"given": True}
        assert db.one("SELECT COUNT(*) AS n FROM feedback")["n"] == 1   # the second answer replaced the first
    finally:
        accounts.erase_user(uid)


@pytest.mark.parametrize("body", [{"easier": "maybe", "trust": "yes", "rating": 3}, {"easier": "yes", "trust": "idk", "rating": 3},
                                  {"easier": "yes", "trust": "yes", "rating": 0}, {"easier": "yes", "trust": "yes", "rating": 6}])
def test_bad_answers_are_refused(body):
    uid, auth_h = make_student(2)
    try:
        assert client.post("/api/feedback", json=body, headers=auth_h).status_code == 400
    finally:
        accounts.erase_user(uid)


def test_summary_needs_five_answers():
    made = []
    try:
        for n in range(10, 15):
            uid, auth_h = make_student(n)
            made.append(uid)
            assert "easier_yes" not in client.get("/api/feedback/summary").json()
            client.post("/api/feedback", json={"easier": "yes" if n % 2 == 0 else "same", "trust": "yes", "rating": 4}, headers=auth_h)
        result = client.get("/api/feedback/summary").json()
        assert result["responses"] == 5 and result["trust_yes"] == 5 and result["average_rating"] == 4.0 and result["easier_yes"] == 3
    finally:
        for uid in made:
            accounts.erase_user(uid)


def test_feedback_is_removed_with_the_account():
    uid, auth_h = make_student(20)
    client.post("/api/feedback", json={"easier": "yes", "trust": "yes", "rating": 5}, headers=auth_h)
    accounts.erase_user(uid)
    assert db.one("SELECT COUNT(*) AS n FROM feedback")["n"] == 0
