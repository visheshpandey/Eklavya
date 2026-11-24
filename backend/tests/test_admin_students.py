"""The owner's student list: switched off without ADMIN_KEY, locked behind it, and never showing secrets or guests."""
import dataclasses

import conftest  # noqa: F401  (isolated DB before the app is imported)
from fastapi.testclient import TestClient

from app import db, main as app_main
from app.api.routes import admin as admin_route
from app.config import settings
from app.services import admin_students

KEY = "k" * 24


def _client(monkeypatch, key=KEY):
    monkeypatch.setattr(admin_route, "settings", dataclasses.replace(settings, admin_key=key))
    return TestClient(app_main.create_app())


def test_pure_helpers():
    assert admin_students.sign_in_methods(True, False) == ["Password"]
    assert admin_students.sign_in_methods(True, True) == ["Password", "Google"]
    assert admin_students.sign_in_methods(False, False) == []
    assert admin_students.latest(None, "2026-11-01 10:00:00", "2026-11-02 09:00:00", None) == "2026-11-02 09:00:00"
    assert admin_students.latest(None, None) is None


def test_switched_off_without_a_key(monkeypatch):
    client = _client(monkeypatch, key="")
    assert client.get("/api/admin/students", headers={"X-Admin-Key": "anything"}).status_code == 404


def test_wrong_or_missing_key_is_refused(monkeypatch):
    client = _client(monkeypatch)
    assert client.get("/api/admin/students").status_code == 401
    assert client.get("/api/admin/students", headers={"X-Admin-Key": "wrong"}).status_code == 401


def test_guessing_the_key_is_limited(monkeypatch):
    client = _client(monkeypatch)
    codes = [client.get("/api/admin/students", headers={"X-Admin-Key": f"guess{i}"}).status_code for i in range(12)]
    assert codes[0] == 401 and codes[-1] == 429


def test_export_needs_the_key_and_leaves_out_secrets(monkeypatch):
    db.execute("INSERT INTO users (name, email, password_hash, google_sub) VALUES (?, ?, ?, ?)", ("Mira", "mira@example.com", "HASH-VALUE", "SUB-VALUE"))
    db.execute("INSERT INTO password_resets (user_id, token_hash) VALUES (1, 'RESET-TOKEN')")
    client = _client(monkeypatch)
    assert client.get("/api/admin/export").status_code == 401
    res = client.get("/api/admin/export", headers={"X-Admin-Key": KEY})
    assert res.status_code == 200 and "attachment" in res.headers["content-disposition"] and res.headers["cache-control"] == "no-store"
    body = res.json()
    assert any(u["email"] == "mira@example.com" for u in body["tables"]["users"]) and body["counts"]["users"] == len(body["tables"]["users"])
    assert "doubts" in body["tables"] and "chunk_embeddings" not in body["tables"] and "password_resets" not in body["tables"]
    assert "HASH-VALUE" not in res.text and "SUB-VALUE" not in res.text and "RESET-TOKEN" not in res.text
    assert _client(monkeypatch, key="").get("/api/admin/export", headers={"X-Admin-Key": KEY}).status_code == 404   # switched off without a key


def test_lists_real_accounts_only_and_never_secrets(monkeypatch):
    db.execute("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)", ("Asha Rao", "asha@example.com", "SECRET-HASH", "2026-11-20 08:00:00"))
    google = db.execute("INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)", ("Dev Mehta", "dev@example.com", "SECRET-SUB"))
    db.execute("INSERT INTO users (name, guest_since) VALUES ('Guest', '2026-11-20T00:00:00')")
    db.execute("INSERT INTO doubts (user_id, question, answer, topic, grounded, created_at) VALUES (?, ?, ?, ?, ?, ?)", (google, "q", "a", "Joins", 1, "2026-11-22 10:00:00"))
    res = _client(monkeypatch).get("/api/admin/students", headers={"X-Admin-Key": KEY})
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    people = {p["email"]: p for p in res.json()["students"]}
    assert {"asha@example.com", "dev@example.com"} <= set(people) and all(p["email"] for p in people.values())
    assert people["asha@example.com"]["sign_in"] == ["Password"] and people["asha@example.com"]["joined"] == "2026-11-20 08:00:00"
    assert people["dev@example.com"]["sign_in"] == ["Google"] and people["dev@example.com"]["activity"]["questions"] == 1
    assert people["dev@example.com"]["last_active"] == "2026-11-22 10:00:00"
    assert "SECRET" not in res.text and "password_hash" not in res.text and "google_sub" not in res.text
