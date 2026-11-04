"""Private guests: each browser has its own data, feedback counts per guest, and old guests are cleared without losing their feedback."""
from datetime import datetime, timedelta, timezone

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.ai import embeddings
from app.services import guests
from main import app  # noqa: F401
from tests.test_live import client


def guest():
    res = client.post("/api/guest")
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(autouse=True)
def clean():
    db.execute("DELETE FROM feedback")
    yield
    for row in db.query("SELECT id FROM users WHERE guest_since IS NOT NULL"):
        accounts.erase_user(row["id"])
    db.execute("DELETE FROM feedback")


def test_two_guests_do_not_see_each_others_notes():
    one, two = guest(), guest()
    assert client.post("/api/demo/seed", headers=one).status_code == 200
    assert client.get("/api/dashboard", headers=one).json()["mastery"]
    assert not client.get("/api/dashboard", headers=two).json()["mastery"]


def test_five_guests_feedback_counts_as_five():
    for _ in range(5):
        assert client.post("/api/feedback", headers=guest(), json={"easier": "yes", "trust": "yes", "rating": 4}).status_code == 200
    summary = client.get("/api/feedback/summary").json()
    assert summary["responses"] == 5 and summary["easier_yes"] == 5


def test_a_guest_is_treated_as_a_guest_not_an_account():
    headers = guest()
    assert client.get("/api/auth/me", headers=headers).json()["guest"] is True
    assert client.post("/api/groups", headers=headers, json={"name": "x"}).status_code == 400


def test_a_real_account_still_cannot_load_the_demo():
    made = client.post("/api/auth/signup", json={"email": "realuser@example.com", "password": "longenough1"}).json()
    try:
        assert client.post("/api/demo/seed", headers={"Authorization": f"Bearer {made['token']}"}).status_code == 403
    finally:
        accounts.erase_user(made["user"]["id"])


def test_old_guests_are_cleared_but_their_feedback_stays():
    old, fresh = guest(), guest()
    client.post("/api/feedback", headers=old, json={"easier": "no", "trust": "yes", "rating": 3})
    old_id = client.get("/api/auth/me", headers=old).json()["id"]
    long_ago = (datetime.now(timezone.utc) - timedelta(days=guests.KEEP_DAYS + 1)).isoformat()
    db.execute("UPDATE users SET guest_since = ? WHERE id = ?", (long_ago, old_id))
    assert guests.purge_old() == 1
    assert not db.one("SELECT id FROM users WHERE id = ?", (old_id,))
    assert client.get("/api/feedback/summary").json()["responses"] == 1
    assert client.get("/api/auth/me", headers=fresh).status_code == 200


def test_a_cleared_guest_gets_a_401_so_the_browser_can_start_again():
    headers = guest()
    accounts.erase_user(client.get("/api/auth/me", headers=headers).json()["id"])
    assert client.get("/api/dashboard", headers=headers).status_code == 401


def test_the_demo_notes_call_gemini_only_for_the_first_guest(monkeypatch):
    calls = []

    def fake(texts, _task):
        calls.append(len(texts))
        return [[0.1, 0.2] for _ in texts]
    monkeypatch.setattr(embeddings, "embed", fake)
    client.post("/api/demo/seed", headers=guest())
    first = len(calls)
    client.post("/api/demo/seed", headers=guest())
    assert first > 0 and len(calls) == first
