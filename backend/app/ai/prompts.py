"""Loads prompt files from ``app/prompts``.

Prompts are plain Markdown so they can be edited without touching Python. They are read once
and cached; a missing file raises a clear error naming the path.
"""
from functools import lru_cache
from pathlib import Path

from app.config import ConfigError

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache(maxsize=None)
def load(name: str) -> str:
    path = PROMPTS_DIR / name
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ConfigError(f"Prompt file is missing or unreadable: {path}") from exc
