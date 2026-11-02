"""Gives notes stored before titles were derived a real name and a source type, and merges imported links that were added twice.
Runs at startup (best effort, quick, no model calls): a heading from the notes' own text, else the file name without its extension."""
import logging

from app import db
from app.domain import titles
from app.services.documents import delete_document

log = logging.getLogger(__name__)


def _text_of(document_id: int) -> str:
    rows = db.query("SELECT heading, text FROM chunks WHERE document_id = ? ORDER BY id LIMIT 3", (document_id,))
    return "\n".join(f"{r['heading'] or ''}\n{r['text'] or ''}" for r in rows)


def retitle_existing() -> dict:
    renamed = typed = merged = 0
    for doc in db.query("SELECT id, user_id, file_name, source_kind FROM documents ORDER BY id"):
        name, kind = doc["file_name"], doc["source_kind"]
        if not kind:
            kind = titles.kind_for(name)
            db.execute("UPDATE documents SET source_kind = ? WHERE id = ?", (kind, doc["id"]))
            typed += 1
        if titles.is_weak(name):
            better = titles.best_title(name, _text_of(doc["id"]))
            if better and better != name and not titles.is_weak(better):
                db.execute("UPDATE documents SET file_name = ? WHERE id = ?", (better, doc["id"]))
                renamed += 1
    seen: dict = {}
    for doc in db.query("SELECT id, user_id, file_name, source_kind FROM documents WHERE source_kind IN ('link', 'youtube') ORDER BY id"):
        key = (doc["user_id"], doc["source_kind"], doc["file_name"].strip().lower())
        if key in seen:
            delete_document(doc["user_id"], doc["id"])   # the same page imported twice: the first one stays
            merged += 1
        else:
            seen[key] = doc["id"]
    if renamed or typed or merged:
        log.info("Re-titled %d notes, typed %d, merged %d duplicate links", renamed, typed, merged)
    return {"renamed": renamed, "typed": typed, "merged": merged}
