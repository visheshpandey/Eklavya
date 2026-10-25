"""Shared test setup: isolated temp DB, backend on sys.path (must run before config is imported)."""
import os
import sys
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
