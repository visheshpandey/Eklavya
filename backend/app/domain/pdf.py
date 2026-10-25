"""Plain-text extraction from uploaded study files (PDF or TXT)."""
import io
import logging

import pdfplumber

from app.errors import BadRequestError

log = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = (".pdf", ".txt")


def extract_text(filename: str, raw: bytes) -> str:
    """Return the text of an uploaded file. Raises BadRequestError for unsupported or unreadable files."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _pdf_text(raw)
    if name.endswith(".txt"):
        return raw.decode("utf-8", errors="ignore").strip()
    raise BadRequestError("Only PDF and TXT files are supported.")


def _pdf_text(raw: bytes) -> str:
    try:
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
    except Exception as exc:  # noqa: BLE001 - pdfplumber raises many unrelated types for bad files
        log.warning("Could not read PDF: %s", exc)
        raise BadRequestError("That PDF could not be read. Is it a valid, unprotected PDF?") from exc
    return "\n".join(p for p in pages if p).strip()
