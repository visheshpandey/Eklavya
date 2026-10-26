"""Gemini text client used by every agent (JSON mode).

Gemini is the only model in this project. There is no fallback content: if a call fails
(network, quota, timeout, unusable JSON after one retry) ``llm_json`` raises ``LLMError``
and the API answers 502.

``call_llm_json`` is the single network seam; tests replace it with a fake.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time

from google import genai
from google.genai import types

from app.config import settings
from app.errors import LLMError

log = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 600   # identical prompts within 10 minutes reuse the previous answer
ATTEMPTS = 3              # tries per call (Gemini is sometimes briefly overloaded)
RETRY_PAUSE_SECONDS = 2   # grows with each retry
TRANSIENT = ("503", "504", "429", "UNAVAILABLE", "DEADLINE", "RESOURCE_EXHAUSTED", "overloaded", "timed out")

_client: genai.Client | None = None
_cache: dict[str, tuple[float, dict]] = {}


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")
        _client = genai.Client(api_key=settings.gemini_api_key,
                               http_options=types.HttpOptions(timeout=settings.gemini_timeout_ms))
    return _client


def _parse_json(raw: str) -> dict:
    """Parse model output, tolerating accidental markdown code fences."""
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    return json.loads(text)


def call_llm_json(system: str, prompt: str, required_keys=(), temperature: float = 0.7, timeout_ms: int | None = None) -> dict:
    """Call Gemini in JSON mode and validate the keys.

    Returns ``{"success": True, "data": {...}}`` or ``{"success": False, "error": "..."}``.
    ``timeout_ms`` overrides the default limit for one heavy call. Results are cached for ``CACHE_TTL_SECONDS``.
    """
    cache_key = hashlib.sha256(f"{settings.gemini_model}|{system}|{prompt}|{temperature}".encode()).hexdigest()
    hit = _cache.get(cache_key)
    if hit and time.time() - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]

    last_error = "unknown error"
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = _get_client().models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    temperature=temperature,
                    http_options=types.HttpOptions(timeout=timeout_ms) if timeout_ms else None,
                ),
            )
            data = _parse_json(response.text or "")
            missing = [k for k in required_keys if k not in data]
            if missing:
                raise ValueError(f"missing fields: {', '.join(missing)}")
            result = {"success": True, "data": data}
            _cache[cache_key] = (time.time(), result)
            return result
        except json.JSONDecodeError as exc:
            last_error = f"Gemini returned invalid JSON ({exc})"
        except Exception as exc:  # noqa: BLE001 - network/quota/SDK errors all mean "try again, then fail"
            last_error = str(exc)
        log.warning("Gemini call failed (attempt %d/%d): %s", attempt, ATTEMPTS, last_error)
        if attempt < ATTEMPTS and any(marker.lower() in last_error.lower() for marker in TRANSIENT):
            time.sleep(RETRY_PAUSE_SECONDS * attempt)   # give an overloaded model a moment before trying again
    return {"success": False, "error": last_error}


def llm_json(system: str, prompt: str, required_keys=(), temperature: float = 0.7, timeout_ms: int | None = None) -> dict | list:
    """Like ``call_llm_json`` but returns the data or raises ``LLMError``. ``timeout_ms`` lengthens the limit for one call."""
    extra = {} if timeout_ms is None else {"timeout_ms": timeout_ms}   # keeps simple test doubles working
    result = call_llm_json(system, prompt, required_keys, temperature, **extra)
    if not result["success"]:
        raise LLMError(f"Gemini request failed: {result['error']}")
    return result["data"]


def extract_list(data, *keys) -> list:
    """Gemini sometimes answers with a bare JSON array instead of {"key": [...]}. Accept both.

    Looks for the first of ``keys`` holding a list, then for the only list in the object; returns [] if none.
    """
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in keys:
            if isinstance(data.get(key), list):
                return data[key]
        lists = [value for value in data.values() if isinstance(value, list)]
        if len(lists) == 1:
            return lists[0]
    return []


IMAGE_TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "heic": "image/heic"}
IMAGE_PROMPT = ("This is a photo of a student's study material (a textbook page, handwritten notes, a slide or a "
                "question). Write out all of its study content as clean plain text: keep headings on their own "
                "lines, keep formulas (write them in plain text, e.g. TP / (TP + FP)), and describe any diagram in "
                "one sentence in square brackets. Do not add anything that is not in the photo. If there is no "
                "readable study content, answer exactly: NO_TEXT")


def read_image(data: bytes, mime_type: str) -> str:
    """Text of a photographed page (Gemini multimodal). Raises ``LLMError`` if Gemini fails."""
    last_error = "unknown error"
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = _get_client().models.generate_content(
                model=settings.gemini_model,
                contents=[types.Part.from_bytes(data=data, mime_type=mime_type), IMAGE_PROMPT],
                config=types.GenerateContentConfig(temperature=0.1, http_options=types.HttpOptions(timeout=settings.gemini_long_timeout_ms)),
            )
            text = (response.text or "").strip()
            return "" if text == "NO_TEXT" else text
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        log.warning("Gemini image read failed (attempt %d/%d): %s", attempt, ATTEMPTS, last_error)
        if attempt < ATTEMPTS and any(marker.lower() in last_error.lower() for marker in TRANSIENT):
            time.sleep(RETRY_PAUSE_SECONDS * attempt)
    raise LLMError(f"Gemini could not read the photo: {last_error}")
