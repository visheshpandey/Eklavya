"""Account management (limits, password change/reset, delete, Google), flashcard review, scanned PDFs, links, reminders."""
import dataclasses
import io
from datetime import date, timedelta

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest
from fastapi.testclient import TestClient

from app import accounts, auth, db
from app.agents import flashcards
from app.api.routes import documents as documents_route
from app.api.routes import reminders as reminders_route
from app.config import settings
from app.errors import BadRequestError
from app.services import links, mailer, reminders
from main import app

client = TestClient(app)
NOTES = "Precision is the share of flagged emails that really are spam. Precision = TP / (TP + FP). " * 4


@pytest.fixture(autouse=True)
def erase_test_accounts():
    """Accounts made here are removed afterwards, so their topics and answers never leak into other test files."""
    yield
    for row in db.query("SELECT id FROM users WHERE id != ?", (settings.demo_user_id,)):
        accounts.erase_user(row["id"])


def signup(email, password="longenough1"):
    response = client.post("/api/auth/signup", json={"name": "Asha", "email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def with_settings(monkeypatch, module, **changes):
    monkeypatch.setattr(module, "settings", dataclasses.replace(settings, **changes))


# ---------------------------------------------------------------- sign-in limits
def test_repeated_wrong_passwords_are_stopped_and_a_right_one_clears_the_count():
    signup("limit@example.com")
    for _ in range(4):
        assert client.post("/api/auth/login", json={"email": "limit@example.com", "password": "wrong-wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "limit@example.com", "password": "longenough1"}).status_code == 200
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "limit@example.com", "password": "wrong-wrong"})
    blocked = client.post("/api/auth/login", json={"email": "limit@example.com", "password": "longenough1"})
    assert blocked.status_code == 429 and "wait" in blocked.json()["error"]


# ---------------------------------------------------------------- change password, delete account
def test_change_password_needs_the_current_one():
    token = signup("change@example.com")["token"]
    wrong = client.post("/api/auth/password", headers=bearer(token), json={"current_password": "nope-nope", "new_password": "brand-new-1"})
    assert wrong.status_code == 401
    ok = client.post("/api/auth/password", headers=bearer(token), json={"current_password": "longenough1", "new_password": "brand-new-1"})
    assert ok.status_code == 200
    assert client.post("/api/auth/login", json={"email": "change@example.com", "password": "brand-new-1"}).status_code == 200
    assert client.post("/api/auth/password", json={"current_password": "x", "new_password": "brand-new-1"}).status_code == 400   # guest


def test_delete_account_needs_the_password_and_erases_everything():
    made = signup("gone@example.com")
    user_id, token = made["user"]["id"], made["token"]
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (user_id, "n.txt"))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc, "Recall"))
    db.execute("INSERT INTO learner_mastery (user_id, topic_id) VALUES (?, ?)", (user_id, topic))
    db.execute("INSERT INTO flashcards (user_id, topic_id, front, back) VALUES (?, ?, 'f', 'b')", (user_id, topic))
    assert client.post("/api/auth/delete", headers=bearer(token), json={"password": "wrong-wrong"}).status_code == 401
    assert db.one("SELECT id FROM users WHERE id = ?", (user_id,))
    assert client.post("/api/auth/delete", headers=bearer(token), json={"password": "longenough1"}).status_code == 200
    assert not db.one("SELECT id FROM users WHERE id = ?", (user_id,))
    assert not db.query("SELECT id FROM flashcards WHERE user_id = ?", (user_id,))
    assert not db.query("SELECT id FROM documents WHERE user_id = ?", (user_id,))
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401


# ---------------------------------------------------------------- forgotten password
def test_forgot_password_is_off_without_email_settings():
    assert client.post("/api/auth/forgot", json={"email": "x@example.com"}).status_code == 400


def test_reset_link_sets_a_new_password_once(monkeypatch):
    signup("reset@example.com")
    sent = []
    monkeypatch.setattr(mailer, "enabled", lambda: True)
    monkeypatch.setattr(mailer, "send", lambda to, subject, text: sent.append((to, text)) or True)
    unknown = client.post("/api/auth/forgot", json={"email": "nobody@example.com"}).json()
    known = client.post("/api/auth/forgot", json={"email": "RESET@example.com"}).json()
    assert unknown == known                                   # same answer: no hint which emails exist
    assert len(sent) == 1 and sent[0][0] == "reset@example.com"
    token = sent[0][1].split("?reset=")[1].split()[0]
    assert client.post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 400
    done = client.post("/api/auth/reset", json={"token": token, "password": "after-reset-1"})
    assert done.status_code == 200 and done.json()["token"]
    assert client.post("/api/auth/reset", json={"token": token, "password": "again-again-1"}).status_code == 400   # used
    assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "after-reset-1"}).status_code == 200


def test_reset_link_expires(monkeypatch):
    user_id = signup("late@example.com")["user"]["id"]
    db.execute("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
               (user_id, accounts._hash("old-token-123"), "1000"))
    assert client.post("/api/auth/reset", json={"token": "old-token-123", "password": "whatever-1"}).status_code == 400


# ---------------------------------------------------------------- Google sign-in
def test_google_sign_in_creates_an_account_then_reuses_it(monkeypatch):
    with_settings(monkeypatch, accounts, google_client_id="client-123")
    monkeypatch.setattr(accounts, "_verify_google", lambda cred: {"sub": "g-1", "email": "Meera@Gmail.com", "email_verified": True, "name": "Meera"})
    first = client.post("/api/auth/google", json={"credential": "a-google-id-token"}).json()
    again = client.post("/api/auth/google", json={"credential": "a-google-id-token"}).json()
    assert first["user"]["id"] == again["user"]["id"] and first["user"]["email"] == "meera@gmail.com"
    me = client.get("/api/auth/me", headers=bearer(first["token"])).json()
    assert me["google"] is True and me["has_password"] is False


def test_google_sign_in_links_an_existing_email_account(monkeypatch):
    existing = signup("linked@example.com")["user"]["id"]
    with_settings(monkeypatch, accounts, google_client_id="client-123")
    monkeypatch.setattr(accounts, "_verify_google", lambda cred: {"sub": "g-2", "email": "linked@example.com", "email_verified": True})
    assert client.post("/api/auth/google", json={"credential": "a-google-id-token"}).json()["user"]["id"] == existing


def test_google_sign_in_is_off_without_a_client_id():
    assert client.post("/api/auth/google", json={"credential": "a-google-id-token"}).status_code == 400
    assert client.get("/api/auth/config").json()["google_client_id"] is None


# ---------------------------------------------------------------- flashcard review
def test_review_moves_known_cards_out_and_keeps_forgotten_ones_due():
    made = signup("cards@example.com")
    user_id = made["user"]["id"]
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (user_id, "n.txt"))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc, "Recall"))
    a = db.execute("INSERT INTO flashcards (user_id, topic_id, front, back) VALUES (?, ?, 'a', 'A')", (user_id, topic))
    b = db.execute("INSERT INTO flashcards (user_id, topic_id, front, back) VALUES (?, ?, 'b', 'B')", (user_id, topic))
    due = client.get("/api/flashcards/due", headers=bearer(made["token"])).json()["cards"]
    assert {c["id"] for c in due} == {a, b}
    knew = client.post(f"/api/flashcards/{a}/review", headers=bearer(made["token"]), json={"knew": True}).json()
    forgot = client.post(f"/api/flashcards/{b}/review", headers=bearer(made["token"]), json={"knew": False}).json()
    assert knew["box"] == 1 and forgot["box"] == 0 and forgot["due_count"] == 1
    assert [c["id"] for c in client.get("/api/flashcards/due", headers=bearer(made["token"])).json()["cards"]] == [b]
    other = signup("other-cards@example.com")["token"]
    assert client.post(f"/api/flashcards/{a}/review", headers=bearer(other), json={"knew": True}).status_code == 404


def test_boxes_climb_to_a_month_and_drop_back_to_today():
    assert [flashcards.next_box(box, True) for box in (None, 0, 1, 4, 5)] == [1, 1, 2, 5, 5]
    assert flashcards.next_box(5, False) == 0
    assert flashcards.BOX_DAYS[flashcards.next_box(4, True)] == 30


# ---------------------------------------------------------------- scanned PDFs and links
def test_a_scanned_pdf_is_read_by_gemini(monkeypatch):
    from PIL import Image
    buffer = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(buffer, "PDF")
    monkeypatch.setattr(documents_route, "read_pdf", lambda raw: NOTES)
    monkeypatch.setattr(documents_route, "ingest_document", lambda user_id, name, content: {"name": name, "chars": len(content)})
    response = client.post("/api/upload-document", files={"file": ("scan.pdf", buffer.getvalue(), "application/pdf")})
    assert response.status_code == 200 and response.json() == {"name": "scan.pdf", "chars": len(NOTES)}


def test_import_link_turns_a_link_into_notes(monkeypatch):
    monkeypatch.setattr(documents_route, "notes_from_link", lambda url: ("Precision and recall", NOTES))
    monkeypatch.setattr(documents_route, "ingest_document", lambda user_id, name, content: {"name": name})
    assert client.post("/api/import-link", json={"url": "https://example.com/precision"}).json() == {"name": "Precision and recall"}


@pytest.mark.parametrize("url, expected", [
    ("https://www.youtube.com/watch?v=Kdsp6soqA7o", "Kdsp6soqA7o"), ("https://youtu.be/Kdsp6soqA7o?t=30", "Kdsp6soqA7o"),
    ("https://youtube.com/shorts/Kdsp6soqA7o", "Kdsp6soqA7o"), ("https://example.com/watch?v=Kdsp6soqA7o", None),
    ("https://www.youtube.com/watch?v=short", None)])
def test_youtube_links_are_recognised(url, expected):
    assert links.youtube_id(url) == expected


@pytest.mark.parametrize("url", ["http://localhost:5000/", "http://127.0.0.1/admin", "http://169.254.169.254/", "http://10.1.2.3/",
                                 "file:///etc/passwd", "ftp://example.com/"])
def test_links_to_this_machine_or_private_networks_are_refused(url):
    with pytest.raises(BadRequestError):
        links.notes_from_link(url)


# ---------------------------------------------------------------- reminders
def _account_with_notes(email):
    made = signup(email)
    user_id = made["user"]["id"]
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (user_id, "n.txt"))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc, "Recall"))
    db.execute("INSERT INTO learner_mastery (user_id, topic_id, mastery_score) VALUES (?, ?, 35)", (user_id, topic))
    old = (date.today() - timedelta(days=3)).isoformat() + " 10:00:00"
    db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question, is_correct, mastery_before, mastery_after, answered_at) "
               "VALUES (?, ?, 'q', 0, 40, 35, ?)", (user_id, topic, old))
    db.execute("INSERT INTO flashcards (user_id, topic_id, front, back) VALUES (?, ?, 'f', 'b')", (user_id, topic))
    return made


def test_reminder_message_names_what_is_due():
    made = _account_with_notes("due@example.com")
    message = reminders.message_for(made["user"]["id"])
    assert "1 topic due for revision (Recall)" in message["body"] and "1 flashcard to review" in message["body"]


def test_subscribing_a_device_turns_push_on_and_guests_cannot():
    token = signup("push@example.com")["token"]
    sub = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "key", "auth": "secret"}}
    on = client.post("/api/push/subscribe", headers=bearer(token), json=sub).json()
    assert on["push"] is True and on["devices"] == 1
    assert client.post("/api/push/unsubscribe", headers=bearer(token), json=sub).json()["devices"] == 0
    assert client.post("/api/push/subscribe", json=sub).status_code == 400


def test_daily_run_needs_the_secret_and_reminds_each_student_once(monkeypatch):
    made = _account_with_notes("daily@example.com")
    client.post("/api/push/subscribe", headers=bearer(made["token"]),
                json={"endpoint": "https://push.example.com/daily", "keys": {"p256dh": "key", "auth": "secret"}})
    pushed = []
    monkeypatch.setattr(reminders, "push_enabled", lambda: True)
    monkeypatch.setattr(reminders, "_push", lambda row, message: pushed.append((row["endpoint"], message["title"])) or True)
    assert client.post("/api/reminders/run", headers={"X-Cron-Secret": "anything"}).status_code == 401   # no secret configured
    with_settings(monkeypatch, reminders_route, cron_secret="s3cret")
    assert client.post("/api/reminders/run", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    first = client.post("/api/reminders/run", headers={"X-Cron-Secret": "s3cret"}).json()
    second = client.post("/api/reminders/run", headers={"X-Cron-Secret": "s3cret"}).json()
    assert first["push"] >= 1 and ("https://push.example.com/daily", "Time for today's study") in pushed
    assert second["users"] == 0                                   # at most once a day


def test_generated_push_keys_can_sign():
    import subprocess
    import sys
    from py_vapid import Vapid   # the class pywebpush signs with
    out = subprocess.run([sys.executable, "scripts/make_vapid_keys.py"], capture_output=True, text=True, check=True).stdout
    private = out.split("VAPID_PRIVATE_KEY=")[1].strip()
    claims = Vapid.from_string(private).sign({"aud": "https://push.example.com", "sub": "mailto:a@b.co"})
    assert claims["Authorization"].startswith("vapid t=")
