"""Daily study reminders: a push notification (browser or the installed app) and/or an email, once a day at most.

A scheduler calls ``run_all`` once a day (POST /api/reminders/run, see .github/workflows/reminders.yml). Each student
who switched reminders on gets one message built from their Today screen: what is due for revision, cards to review,
or simply the streak to keep.
"""
from __future__ import annotations

import json
import logging

from app import db
from app.config import settings
from app.errors import BadRequestError
from app.services import mailer
from app.services.progress_data import local_today
from app.services.today import today as today_screen

log = logging.getLogger(__name__)
PUSH_TTL_SECONDS = 12 * 60 * 60   # a phone that is off for longer than this gets no stale reminder


def push_enabled() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def _account(user_id: int) -> dict:
    if user_id == settings.demo_user_id:
        raise BadRequestError("Reminders need your own account. Sign in or create one first.")
    return db.one("SELECT id, name, email, remind_push, remind_email FROM users WHERE id = ?", (user_id,))


def get_settings(user_id: int) -> dict:
    row = _account(user_id)
    devices = db.one("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", (user_id,))["n"]
    return {"push": bool(row["remind_push"]), "email": bool(row["remind_email"]), "devices": devices,
            "push_available": push_enabled(), "email_available": mailer.enabled(), "push_key": settings.vapid_public_key or None}


def save_settings(user_id: int, push: bool | None, email: bool | None) -> dict:
    _account(user_id)
    if push is not None:
        db.execute("UPDATE users SET remind_push = ? WHERE id = ?", (int(push), user_id))
    if email is not None:
        if email and not mailer.enabled():
            raise BadRequestError("Email is not set up on this server yet.")
        db.execute("UPDATE users SET remind_email = ? WHERE id = ?", (int(email), user_id))
    return get_settings(user_id)


def subscribe(user_id: int, subscription: dict) -> dict:
    _account(user_id)
    keys = subscription.get("keys") or {}
    if not (keys.get("p256dh") and keys.get("auth")):
        raise BadRequestError("This browser sent an incomplete push subscription.")
    db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (subscription["endpoint"],))   # a device moves to whoever signed in last
    db.execute("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)",
               (user_id, subscription["endpoint"], keys["p256dh"], keys["auth"]))
    db.execute("UPDATE users SET remind_push = 1 WHERE id = ?", (user_id,))
    return get_settings(user_id)


def unsubscribe(user_id: int, endpoint: str) -> dict:
    db.execute("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", (user_id, endpoint))
    return get_settings(user_id)


def message_for(user_id: int) -> dict | None:
    """Title, body and where to open, from the student's Today screen. None when there is nothing to study yet."""
    screen = today_screen(user_id)
    if not screen["has_notes"]:
        return None
    due, cards, streak = len(screen["due"]), screen.get("cards_due", 0), screen["streak"]
    parts = []
    if due:
        parts.append(f"{due} topic{'s' if due > 1 else ''} due for revision ({', '.join(d['topic'] for d in screen['due'][:2])})")
    if cards:
        parts.append(f"{cards} flashcard{'s' if cards > 1 else ''} to review")
    if parts:
        body = " and ".join(parts) + f". About {max(screen['plan_minutes'], 5)} minutes."
    elif screen["plan"]:
        body = f"Today's plan: {screen['plan'][0]['topic']}, about {max(screen['plan_minutes'], 5)} minutes."
    else:
        body = "A 5-minute revision keeps it fresh."
    title = f"Keep your {streak}-day streak going" if streak else "Time for today's study"
    return {"title": title, "body": body, "url": f"{settings.app_url}/?view=today"}


def _push(row: dict, message: dict) -> bool:
    """Send to one device. A device that unsubscribed (404/410) is forgotten."""
    from pywebpush import WebPushException, webpush
    try:
        webpush({"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}}, json.dumps(message),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject or f"mailto:{settings.smtp_user or 'admin@example.com'}"},
                ttl=PUSH_TTL_SECONDS, timeout=15)
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            db.execute("DELETE FROM push_subscriptions WHERE id = ?", (row["id"],))
        log.warning("Push to device %s failed (%s): %s", row["id"], status, exc)
        return False


def deliver(user: dict, message: dict, push: bool, email: bool) -> dict:
    sent = {"push": 0, "email": False}
    if push and push_enabled():
        for row in db.query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", (user["id"],)):
            sent["push"] += _push(row, message)
    if email and user.get("email"):
        sent["email"] = mailer.send(user["email"], message["title"],
                                    f"Hi {user['name'] or 'there'},\n\n{message['body']}\n\nOpen Eklavya: {message['url']}\n\n"
                                    "You get this because daily reminders are on. Turn them off in your account menu (top right of the app).")
    return sent


def send_test(user_id: int) -> dict:
    user = _account(user_id)
    message = message_for(user_id) or {"title": "Eklavya reminders are on", "body": "Add your notes and you will get a short plan here every day.",
                                       "url": f"{settings.app_url}/?view=today"}
    return deliver(user, message, push=True, email=bool(user["remind_email"]))


def run_all() -> dict:
    """Remind everyone who asked, at most once a day. Returns counts for the scheduler's log."""
    day = local_today().isoformat()
    users = db.query("SELECT id, name, email, remind_push, remind_email FROM users WHERE id != ? "
                     "AND (remind_push = 1 OR remind_email = 1) AND (last_reminded_on IS NULL OR last_reminded_on != ?)",
                     (settings.demo_user_id, day))
    totals = {"users": 0, "push": 0, "email": 0, "skipped": 0}
    for user in users:
        message = message_for(user["id"])
        if not message:
            totals["skipped"] += 1
            continue
        sent = deliver(user, message, push=bool(user["remind_push"]), email=bool(user["remind_email"]))
        db.execute("UPDATE users SET last_reminded_on = ? WHERE id = ?", (day, user["id"]))
        totals["users"] += 1
        totals["push"] += sent["push"]
        totals["email"] += int(sent["email"])
    log.info("Daily reminders: %s", totals)
    return totals
