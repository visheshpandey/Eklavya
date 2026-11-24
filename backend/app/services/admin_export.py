"""A full copy of the database for the owner (GET /api/admin/export): every table as JSON, with the secrets taken out.

Left out on purpose: password hashes, Google ids, password-reset tokens, push-notification keys (a copy must never be a way to sign in as
someone), and the search vectors in chunk_embeddings (large, and rebuilt from the notes). Everything else is included, so this is personal data:
the route is behind ADMIN_KEY.
"""
import re
from datetime import datetime, timezone

from app import db

SECRET_COLUMNS = {"password_hash", "google_sub", "token_hash", "endpoint", "p256dh", "auth"}
SKIPPED_TABLES = {"chunk_embeddings", "password_resets", "push_subscriptions"}


def table_names() -> list:
    return [name for name in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", db.SCHEMA) if name not in SKIPPED_TABLES]


def clean(row: dict) -> dict:
    return {key: value for key, value in row.items() if key not in SECRET_COLUMNS}


def export() -> dict:
    tables = {name: [clean(row) for row in db.query(f"SELECT * FROM {name}")] for name in table_names()}
    return {"exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), "counts": {name: len(rows) for name, rows in tables.items()},
            "left_out": sorted(SECRET_COLUMNS | SKIPPED_TABLES), "tables": tables}
