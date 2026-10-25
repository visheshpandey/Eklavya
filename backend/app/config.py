"""Application settings: the ONLY module that reads environment variables.

Values come from the process environment, optionally loaded from ``backend/.env``
(copy ``.env.example``). Code elsewhere imports ``settings`` and never calls ``os.getenv``.
Fixed business constants (mastery maths, audio formats, ...) live next to the code that
uses them, not here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


class ConfigError(RuntimeError):
    """An environment variable is set to an unusable value. Raised at startup so it fails fast."""


def _str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int, minimum: int = 0) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc
    if value < minimum:
        raise ConfigError(f"{name} must be >= {minimum}, got {value}")
    return value


def _csv(name: str, default: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in _str(name, default).split(",") if part.strip())


@dataclass(frozen=True)
class Settings:
    # --- Gemini (the only model/vendor)
    gemini_api_key: str
    gemini_model: str            # text agents (JSON mode)
    gemini_live_model: str       # live voice tutor
    gemini_timeout_ms: int       # a slow call becomes a 502 instead of hanging
    gemini_long_timeout_ms: int  # for one-off heavy calls such as reading a whole uploaded document
    live_voice: str
    live_affective_dialog: bool  # not supported by every Live model
    session_cap_seconds: int     # Live audio sessions are limited to ~15 minutes
    # --- server
    host: str
    port: int
    reload: bool
    cors_origins: tuple[str, ...]
    log_level: str
    max_upload_mb: int
    # --- storage / data
    db_path: Path
    samples_dir: Path
    demo_user_id: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            gemini_api_key=_str("GEMINI_API_KEY"),
            gemini_model=_str("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            gemini_live_model=_str("GEMINI_LIVE_MODEL", "gemini-3.8-live"),
            gemini_timeout_ms=_int("GEMINI_TIMEOUT_MS", 30_000, minimum=1_000),
            gemini_long_timeout_ms=_int("GEMINI_LONG_TIMEOUT_MS", 90_000, minimum=1_000),
            live_voice=_str("LIVE_VOICE", "Kore"),
            live_affective_dialog=_bool("LIVE_AFFECTIVE_DIALOG", False),
            session_cap_seconds=_int("SESSION_CAP_SECONDS", 840, minimum=30),
            host=_str("HOST", "0.0.0.0"),
            port=_int("PORT", 5000, minimum=1),
            reload=_bool("RELOAD", False),
            cors_origins=_csv("CORS_ORIGINS", "*"),
            log_level=_str("LOG_LEVEL", "INFO").upper(),
            max_upload_mb=_int("MAX_UPLOAD_MB", 10, minimum=1),
            db_path=Path(_str("DB_PATH") or BACKEND_DIR / "data" / "studypilot.db"),
            samples_dir=Path(_str("SAMPLES_DIR") or REPO_DIR / "samples"),
            demo_user_id=_int("DEMO_USER_ID", 1, minimum=1),
        )


settings = Settings.from_env()
