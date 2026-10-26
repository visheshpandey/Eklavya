"""Gemini embeddings for note search: chunks are embedded once at upload, questions at search time.

``embed`` is the single network seam (tests replace it). Search uses embeddings together with BM25 word
matching over the student's own notes; nothing here writes content, so a failed embedding call only means
the search ranks by words for that request (logged), never different notes or invented text.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from google import genai
from google.genai import types

from app import db
from app.config import settings

log = logging.getLogger(__name__)

DIMENSIONS = 256          # small vectors are enough for a few hundred chunks and keep SQLite light
BATCH = 100               # texts per request

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")
        _client = genai.Client(api_key=settings.gemini_api_key,
                               http_options=types.HttpOptions(timeout=settings.gemini_timeout_ms))
    return _client


def embed(texts: list[str], task: str) -> list[list[float]]:
    """``task`` is RETRIEVAL_DOCUMENT for notes or RETRIEVAL_QUERY for a question."""
    vectors = []
    for start in range(0, len(texts), BATCH):
        response = _get_client().models.embed_content(
            model=settings.gemini_embed_model, contents=texts[start:start + BATCH],
            config=types.EmbedContentConfig(task_type=task, output_dimensionality=DIMENSIONS))
        vectors += [list(e.values) for e in response.embeddings]
    return vectors


def embed_chunks(chunk_rows) -> int:
    """Store vectors for ``[{id, heading, text}]``. Returns how many were stored (0 if Gemini failed)."""
    rows = list(chunk_rows)
    if not rows:
        return 0
    try:
        vectors = embed([f"{r.get('heading') or ''}\n{r['text']}".strip() for r in rows], "RETRIEVAL_DOCUMENT")
    except Exception as exc:  # noqa: BLE001 - search still works by words; say so in the log
        log.warning("Could not embed %d chunks: %s", len(rows), exc)
        return 0
    with db.get_conn() as conn:
        conn.executemany("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, vector) VALUES (?, ?)",
                         [(r["id"], db.dumps([round(v, 5) for v in vec])) for r, vec in zip(rows, vectors)])
    return len(vectors)


@lru_cache(maxsize=256)
def _query_vector(query: str) -> tuple[float, ...] | None:
    try:
        return tuple(embed([query], "RETRIEVAL_QUERY")[0])
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not embed the search question: %s", exc)
        return None


def query_vector(query: str):
    """The question's vector, or None when it could not be embedded (cached per question text)."""
    query = " ".join((query or "").split())
    return _query_vector(query) if query else None


def vectors_for(chunk_ids) -> dict:
    ids = list(chunk_ids)
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    return {r["chunk_id"]: db.loads(r["vector"], None)
            for r in db.query(f"SELECT chunk_id, vector FROM chunk_embeddings WHERE chunk_id IN ({marks})", tuple(ids))}
