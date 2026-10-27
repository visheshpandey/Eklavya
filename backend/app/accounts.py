"""Account management on top of app.auth: sign-in limits, password change and reset, deleting an account, Google sign-in."""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque

import requests

from app import auth, db
from app.config import settings
from app.errors import BadRequestError, NotFoundError, TooManyRequestsError, UnauthorizedError
from app.services import mailer
from app.services.documents import delete_document

# ---------------------------------------------------------------- rate limits (one server process, so memory is enough)
WINDOW_SECONDS = 15 * 60
LIMITS = {"login-email": 5, "login-ip": 30, "signup-ip": 10, "forgot-email": 3, "forgot-ip": 10, "google-ip": 30}
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def check_limit(kind: str, key: str, now: float | None = None) -> None:
    """Count one attempt; refuse once the kind's limit is used up in the last 15 minutes."""
    now = now or time.time()
    with _hits_lock:
        hits = _hits[f"{kind}:{key.lower()}"]
        while hits and hits[0] < now - WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= LIMITS[kind]:
            wait = int((hits[0] + WINDOW_SECONDS - now) / 60) + 1
            raise TooManyRequestsError(f"Too many tries. Please wait {wait} minute{'s' if wait > 1 else ''} and try again.")
        hits.append(now)


def clear_limit(kind: str, key: str) -> None:
    with _hits_lock:
        _hits.pop(f"{kind}:{key.lower()}", None)


def reset_limits() -> None:   # tests
    with _hits_lock:
        _hits.clear()


def login(email: str, password: str, ip: str) -> dict:
    check_limit("login-ip", ip)
    check_limit("login-email", email.strip())
    result = auth.sign_in(email, password)
    clear_limit("login-email", email.strip())      # a correct password resets the count for that email
    return result


def signup(name: str, email: str, password: str, ip: str) -> dict:
    check_limit("signup-ip", ip)
    return auth.sign_up(name, email, password)


# ---------------------------------------------------------------- password change, account deletion
def _user(user_id: int) -> dict:
    if user_id == settings.demo_user_id:
        raise BadRequestError("Sign in to your own account first.")
    row = db.one("SELECT * FROM users WHERE id = ?", (user_id,))
    if not row:
        raise NotFoundError("Unknown account")
    return row


def change_password(user_id: int, current: str, new: str) -> dict:
    row = _user(user_id)
    if row.get("password_hash") and not auth.check_password(current, row["password_hash"]):
        raise UnauthorizedError("Your current password is not right.")
    if len(new) < auth.MIN_PASSWORD:
        raise BadRequestError(f"Use a new password with at least {auth.MIN_PASSWORD} characters.")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(new), user_id))
    return {"changed": True}


# rows that belong to the user directly; documents (with their topics, notes and questions) are removed first
_USER_TABLES = ("learner_mastery", "quiz_attempts", "misconceptions", "study_missions", "agent_logs", "learner_state",
                "boards", "flashcards", "password_resets", "push_subscriptions")


def delete_account(user_id: int, password: str, confirm: str) -> dict:
    """Erase the account and everything in it. Needs the password, or (for Google-only accounts) the email typed out."""
    row = _user(user_id)
    if row.get("password_hash"):
        if not auth.check_password(password, row["password_hash"]):
            raise UnauthorizedError("That password is not right, so nothing was deleted.")
    elif (confirm or "").strip().lower() != (row.get("email") or "").lower():
        raise BadRequestError("Type your email address to confirm.")
    erase_user(user_id)
    return {"deleted": True}


def erase_user(user_id: int) -> None:
    """Remove a user and every row that belongs to them."""
    for doc in db.query("SELECT id FROM documents WHERE user_id = ?", (user_id,)):
        delete_document(user_id, doc["id"])
    with db.get_conn() as conn:
        conn.execute("DELETE FROM transcripts WHERE session_id IN (SELECT id FROM voice_sessions WHERE user_id = ?)", (user_id,))
        conn.execute("DELETE FROM viva_answers WHERE viva_id IN (SELECT id FROM vivas WHERE user_id = ?)", (user_id,))
        conn.execute("DELETE FROM debate_rounds WHERE debate_id IN (SELECT id FROM debates WHERE user_id = ?)", (user_id,))
        for table in (*_USER_TABLES, "voice_sessions", "vivas", "debates"):
            conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# ---------------------------------------------------------------- forgotten password
RESET_MINUTES = 30
FORGOT_REPLY = {"sent": True, "message": "If that email has an account, a reset link is on its way. Check your inbox and spam."}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def forgot_password(email: str, ip: str) -> dict:
    if not mailer.enabled():
        raise BadRequestError("Password reset by email is not set up on this server yet.")
    email = email.strip().lower()
    check_limit("forgot-ip", ip)
    check_limit("forgot-email", email)
    row = db.one("SELECT id, name FROM users WHERE email = ?", (email,))
    if row:   # the same answer either way, so the form never reveals which emails have accounts
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
                   (row["id"], _hash(token), str(int(time.time()) + RESET_MINUTES * 60)))
        link = f"{settings.app_url}/?reset={token}"
        mailer.send(email, "Reset your Eklavya password",
                    f"Hi {row['name'] or 'there'},\n\nSomeone (hopefully you) asked to reset your Eklavya password.\n"
                    f"Open this link within {RESET_MINUTES} minutes to choose a new one:\n\n{link}\n\n"
                    "If you did not ask for this, ignore this email; your password stays the same.\n\nEklavya")
    return FORGOT_REPLY


def reset_password(token: str, password: str) -> dict:
    if len(password) < auth.MIN_PASSWORD:
        raise BadRequestError(f"Use a password with at least {auth.MIN_PASSWORD} characters.")
    row = db.one("SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?", (_hash(token or ""),))
    if not row or row["used"] or int(row["expires_at"]) < time.time():
        raise BadRequestError("This reset link has expired or was already used. Ask for a new one.")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(password), row["user_id"]))
    db.execute("UPDATE password_resets SET used = 1 WHERE user_id = ?", (row["user_id"],))   # every older link dies too
    user = db.one("SELECT * FROM users WHERE id = ?", (row["user_id"],))
    return {"token": auth.make_token(user["id"]), "user": auth.public_user(user)}


# ---------------------------------------------------------------- Google sign-in
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
CERTS_TTL_SECONDS = 10 * 60
_certs = {"value": None, "at": 0.0}


def _google_certs() -> dict:
    """Google's public signing keys, cached 10 minutes; a stale copy is used if Google cannot be reached."""
    if _certs["value"] and time.time() - _certs["at"] < CERTS_TTL_SECONDS:
        return _certs["value"]
    try:
        response = requests.get(GOOGLE_CERTS_URL, timeout=10)
        response.raise_for_status()
        _certs.update(value=response.json(), at=time.time())
    except (requests.RequestException, ValueError):
        if not _certs["value"]:
            raise BadRequestError("Google sign-in is not reachable right now. Try again, or use your email and password.") from None
    return _certs["value"]


def _verify_google(credential: str) -> dict:
    from google.auth import exceptions, jwt   # google-auth comes with google-genai
    try:
        claims = jwt.decode(credential, certs=_google_certs(), audience=settings.google_client_id)
    except (exceptions.GoogleAuthError, ValueError):
        raise UnauthorizedError("Google sign-in failed. Please try again.") from None
    if claims.get("iss") not in GOOGLE_ISSUERS or not claims.get("email") or not claims.get("email_verified"):
        raise UnauthorizedError("Google sign-in failed: the Google account has no verified email.")
    return claims


def google_sign_in(credential: str, ip: str) -> dict:
    if not settings.google_client_id:
        raise BadRequestError("Google sign-in is not set up on this server yet.")
    check_limit("google-ip", ip)
    claims = _verify_google(credential)
    email = claims["email"].strip().lower()
    row = db.one("SELECT * FROM users WHERE google_sub = ?", (claims["sub"],)) or db.one("SELECT * FROM users WHERE email = ?", (email,))
    if row:   # Google confirmed the email, so an existing email account is linked to this Google account
        if not row.get("google_sub"):
            db.execute("UPDATE users SET google_sub = ? WHERE id = ?", (claims["sub"], row["id"]))
    else:
        user_id = db.execute("INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)",
                             ((claims.get("name") or email.split("@")[0])[:80], email, claims["sub"]))
        row = db.one("SELECT * FROM users WHERE id = ?", (user_id,))
    return {"token": auth.make_token(row["id"]), "user": auth.public_user(row)}


def server_features() -> dict:
    """What this server has switched on, so the app only shows what works."""
    return {"google_client_id": settings.google_client_id or None, "email": mailer.enabled(),
            "push_key": settings.vapid_public_key or None}
