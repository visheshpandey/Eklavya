"""The FastAPI docs are hidden unless ENABLE_DOCS=true."""
import dataclasses

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.config import settings


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_are_off_by_default(path):
    assert settings.enable_docs is False
    assert TestClient(app_main.create_app()).get(path).status_code == 404


def test_enable_docs_turns_them_on(monkeypatch):
    monkeypatch.setattr(app_main, "settings", dataclasses.replace(settings, enable_docs=True))
    client = TestClient(app_main.create_app())
    assert client.get("/docs").status_code == 200 and client.get("/openapi.json").json()["info"]["title"] == "Eklavya API"
