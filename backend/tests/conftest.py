"""Shared test setup: isolated temp DB, backend on sys.path (must run before config is imported)."""
import os
import sys
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["GEMINI_API_KEY"] = ""   # set (not removed) so backend/.env cannot fill in the real key: tests never call Gemini
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
