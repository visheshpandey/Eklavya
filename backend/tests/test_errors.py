"""Error handling: every failure answers {"error": message, "code": code} and never leaks internals."""
import dataclasses

import pytest
from fastapi.testclient import TestClient

from app import config
from app.ai import prompts
from app.api.routes import documents
from app.services import topics as topics_service
from main import app

client = TestClient(app)
safe_client = TestClient(app, raise_server_exceptions=False)   # lets us see the 500 response


def assert_error(resp, status, code):
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert body["code"] == code and isinstance(body["error"], str) and body["error"]
    return body


def test_unknown_topic_is_a_404_with_the_standard_shape():
    assert_error(client.get("/api/topics/99999"), 404, "not_found")


def test_unknown_route_uses_the_same_shape():
    assert_error(client.get("/api/does-not-exist"), 404, "http_error")


def test_invalid_body_is_a_422_that_names_the_field():
    body = assert_error(client.post("/api/quiz/submit", json={"question_id": 1, "student_answer": ""}), 422, "invalid_request")
    assert any(f["field"] == "student_answer" for f in body["fields"])
    body = assert_error(client.post("/api/quiz/submit", json={"question_id": 1, "student_answer": "A", "confidence": 3}), 422, "invalid_request")
    assert any(f["field"] == "confidence" for f in body["fields"])


def test_unknown_question_is_a_404():
    assert_error(client.post("/api/quiz/submit", json={"question_id": 999999, "student_answer": "A"}), 404, "not_found")


def test_upload_rejects_unsupported_unreadable_empty_and_oversized_files(monkeypatch):
    assert_error(client.post("/api/upload-document", files={"file": ("n.docx", b"x" * 100)}), 400, "bad_request")
    bad_pdf = client.post("/api/upload-document", files={"file": ("n.pdf", b"this is not a pdf")})
    assert "could not be read" in assert_error(bad_pdf, 400, "bad_request")["error"]
    assert_error(client.post("/api/upload-document", files={"file": ("n.txt", b"too short")}), 400, "bad_request")
    assert_error(client.post("/api/upload-document", data={}), 400, "bad_request")

    monkeypatch.setattr(documents, "settings", dataclasses.replace(config.settings, max_upload_mb=1))
    assert_error(client.post("/api/upload-document", files={"file": ("big.txt", b"a" * (1024 * 1024 + 1))}), 413, "payload_too_large")


def test_unexpected_exceptions_become_a_generic_500_without_leaking_details(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("secret internal detail /etc/passwd")

    monkeypatch.setattr(topics_service.db, "one", boom)
    resp = safe_client.get("/api/topics/1")
    body = assert_error(resp, 500, "internal_error")
    assert "secret" not in resp.text and body["error"] == "Something went wrong on the server."


def test_bad_environment_values_fail_fast_with_a_clear_message(monkeypatch):
    monkeypatch.setenv("PORT", "not-a-number")
    with pytest.raises(config.ConfigError, match="PORT must be an integer"):
        config.Settings.from_env()
    monkeypatch.setenv("PORT", "5000")
    monkeypatch.setenv("SESSION_CAP_SECONDS", "5")
    with pytest.raises(config.ConfigError, match="SESSION_CAP_SECONDS must be >= 30"):
        config.Settings.from_env()


def test_settings_defaults_and_overrides(monkeypatch):
    for name in ("PORT", "CORS_ORIGINS", "LIVE_AFFECTIVE_DIALOG", "SESSION_CAP_SECONDS"):
        monkeypatch.delenv(name, raising=False)
    s = config.Settings.from_env()
    assert s.port == 5000 and s.cors_origins == ("*",) and s.live_affective_dialog is False
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, http://localhost:4000")
    monkeypatch.setenv("LIVE_AFFECTIVE_DIALOG", "true")
    s = config.Settings.from_env()
    assert s.cors_origins == ("http://localhost:3000", "http://localhost:4000") and s.live_affective_dialog is True


def test_missing_prompt_file_names_the_path():
    with pytest.raises(config.ConfigError, match="nope.md"):
        prompts.load("nope.md")
    assert "Eklavya" in prompts.load("persona_eklavya.md")
