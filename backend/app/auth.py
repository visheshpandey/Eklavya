"""Accounts: password hashing, signed session tokens, and the dependency every route uses to learn who is calling.

A request with a valid ``Authorization: Bearer <token>`` header (or ``?token=`` on the voice WebSocket) acts as that user.
A request with no token acts as the shared demo student (guest). A bad or expired token is a 401, never a silent guest:
the client then knows to sign in again. A client can no longer choose another user's id: ``user_id`` in a body, form or
query string is ignored.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time

from fastapi import Depends
from fastapi.requests import HTTPConnection

from app import db
from app.config import settings
from app.errors import BadRequestError, UnauthorizedError

TOKEN_DAYS = 30
MIN_PASSWORD = 8
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _secret() -> bytes:
    """AUTH_SECRET if set; otherwise a random one kept next to the database so tokens survive restarts."""
    if settings.auth_secret:
        return settings.auth_secret.encode()
    path = settings.db_path.parent / ".auth_secret"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_hex(32))
    return path.read_text().strip().encode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${_b64(salt)}${_b64(hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT))}"


def check_password(password: str, stored: str | None) -> bool:
    try:
        scheme, salt, digest = (stored or "").split("$")
        expected = hashlib.scrypt(password.encode(), salt=_unb64(salt), **_SCRYPT)
    except ValueError:
        return False
    return scheme == "scrypt" and hmac.compare_digest(expected, _unb64(digest))


def make_token(user_id: int, now: float | None = None) -> str:
    body = _b64(json.dumps({"uid": user_id, "exp": int((now or time.time()) + TOKEN_DAYS * 86400)}).encode())
    return f"{body}.{_b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())}"


def read_token(token: str, now: float | None = None) -> int:
    try:
        body, signature = token.split(".")
        good = hmac.compare_digest(_unb64(signature), hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        claims = json.loads(_unb64(body))
    except (ValueError, TypeError):
        raise UnauthorizedError("Please sign in again.") from None
    if not good or claims.get("exp", 0) < (now or time.time()):
        raise UnauthorizedError("Please sign in again.")
    return int(claims["uid"])


def _token_from(conn: HTTPConnection) -> str | None:
    header = conn.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return conn.query_params.get("token")     # browsers cannot set headers on a WebSocket


def current_user_id(conn: HTTPConnection) -> int:
    token = _token_from(conn)
    if not token:
        return settings.demo_user_id
    user_id = read_token(token)
    if not db.one("SELECT id FROM users WHERE id = ?", (user_id,)):
        raise UnauthorizedError("Please sign in again.")
    return user_id


CurrentUser = Depends(current_user_id)


def public_user(row: dict) -> dict:
    return {"id": row["id"], "name": row["name"], "email": row["email"], "guest": False}


def sign_up(name: str, email: str, password: str) -> dict:
    email = email.strip().lower()
    if not EMAIL.match(email):
        raise BadRequestError("Enter a valid email address.")
    if len(password) < MIN_PASSWORD:
        raise BadRequestError(f"Use a password with at least {MIN_PASSWORD} characters.")
    if db.one("SELECT id FROM users WHERE email = ?", (email,)):
        raise BadRequestError("That email already has an account. Sign in instead.")
    user_id = db.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                         (name.strip() or email.split("@")[0], email, hash_password(password)))
    return {"token": make_token(user_id), "user": public_user(db.one("SELECT * FROM users WHERE id = ?", (user_id,)))}


def sign_in(email: str, password: str) -> dict:
    row = db.one("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
    # the same message for "no such email" and "wrong password", so the form never reveals which emails exist
    if not row or not check_password(password, row.get("password_hash")):
        raise UnauthorizedError("Wrong email or password.")
    return {"token": make_token(row["id"]), "user": public_user(row)}
