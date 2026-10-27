"""Shared test setup: isolated temp DB, backend on sys.path (must run before config is imported)."""
import os
import sys
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "")   # tests use SQLite unless a Postgres test URL is given
os.environ["GEMINI_API_KEY"] = ""   # set (not removed) so backend/.env cannot fill in the real key: tests never call Gemini
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_sign_in_limits():
    """Every test starts with no sign-in attempts counted (the limits are per process)."""
    from app import accounts
    accounts.reset_limits()
