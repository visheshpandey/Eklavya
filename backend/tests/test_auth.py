"""Accounts: sign up, sign in, tokens, and that one user can never see or act as another."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
from fastapi.testclient import TestClient

from app import auth, db
from app.config import settings
from main import app

client = TestClient(app)


def signup(email, password="longenough1", name="Asha"):
    return client.post("/api/auth/signup", json={"name": name, "email": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_signup_returns_token_and_user_then_login_works():
    made = signup("asha@example.com").json()
    assert made["user"]["email"] == "asha@example.com" and made["user"]["id"] != settings.demo_user_id
    again = client.post("/api/auth/login", json={"email": " ASHA@example.com ", "password": "longenough1"}).json()
    assert again["user"]["id"] == made["user"]["id"]
    me = client.get("/api/auth/me", headers=bearer(again["token"])).json()
    assert me["email"] == "asha@example.com" and me["guest"] is False


def test_password_is_stored_hashed():
    signup("hash@example.com", "secret-pass-1")
    stored = db.one("SELECT password_hash FROM users WHERE email = ?", ("hash@example.com",))["password_hash"]
    assert "secret-pass-1" not in stored and stored.startswith("scrypt$")


def test_bad_signups_and_logins_are_refused_with_a_clear_message():
    assert signup("not-an-email").status_code == 400
    assert signup("short@example.com", "abc").status_code == 400
    signup("dup@example.com")
    assert signup("DUP@example.com").status_code == 400
    wrong = client.post("/api/auth/login", json={"email": "dup@example.com", "password": "nope-nope-1"})
    unknown = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"] == unknown.json()["error"]      # does not reveal which emails exist


def test_no_token_is_the_demo_guest():
    me = client.get("/api/auth/me").json()
    assert me["guest"] is True and me["id"] == settings.demo_user_id


def test_a_bad_or_expired_token_is_401_not_a_silent_guest():
    assert client.get("/api/auth/me", headers=bearer("garbage")).status_code == 401
    user_id = signup("old@example.com").json()["user"]["id"]
    assert client.get("/api/dashboard", headers=bearer(auth.make_token(user_id, now=1))).status_code == 401
    forged = auth.make_token(user_id)[:-4] + "AAAA"
    assert client.get("/api/dashboard", headers=bearer(forged)).status_code == 401


def test_users_only_see_their_own_notes_and_user_id_in_the_request_is_ignored():
    a = signup("a@example.com").json()
    b = signup("b@example.com").json()
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (a["user"]["id"], "a-notes.txt"))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc, "Precision"))
    db.execute("INSERT INTO learner_mastery (user_id, topic_id) VALUES (?, ?)", (a["user"]["id"], topic))
    mine = client.get("/api/dashboard", headers=bearer(a["token"])).json()
    theirs = client.get(f"/api/dashboard?user_id={a['user']['id']}", headers=bearer(b["token"])).json()
    guest = client.get(f"/api/dashboard?user_id={a['user']['id']}").json()
    assert mine["mastery"] and not theirs["mastery"]
    assert all(row["document"] != "a-notes.txt" for row in guest["mastery"])


def test_voice_socket_uses_the_token_and_a_new_account_has_no_notes():
    token = signup("voice@example.com").json()["token"]
    with client.websocket_connect(f"/ws/voice?token={token}") as ws:
        event = ws.receive_json()
    assert event["type"] == "error" and "Upload your notes" in event["message"]
