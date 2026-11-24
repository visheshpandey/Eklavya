"""The owner's list of real accounts (GET /api/admin/students): who signed up, how, and how much each student has done.

Only accounts with an email count (guests and the demo student are not people who signed up). The password hash and the Google id are never
returned, only whether the account has a password or a Google sign-in. This is personal data, so the route is behind ADMIN_KEY.
"""
from app import db

# (key shown in the list, table, time column): how much each student has done, and when they were last seen
ACTIVITY = (("questions", "doubts", "created_at"), ("quiz_answers", "quiz_attempts", "answered_at"), ("voice_sessions", "voice_sessions", "started_at"),
            ("notes", "documents", "uploaded_at"), ("flashcards", "flashcards", "created_at"), ("mock_exams", "mock_exams", "started_at"))


def sign_in_methods(has_password: bool, has_google: bool) -> list:
    return [name for name, on in (("Password", has_password), ("Google", has_google)) if on]


def latest(*stamps) -> str | None:
    """The most recent of several "YYYY-MM-DD HH:MM:SS" texts, ignoring empty ones (pure)."""
    seen = [s for s in stamps if s]
    return max(seen) if seen else None


def students() -> list:
    people = db.query("SELECT id, name, email, preferred_language, daily_study_minutes, target_exam_date, created_at, password_hash, google_sub "
                      "FROM users WHERE email IS NOT NULL AND email <> '' AND guest_since IS NULL ORDER BY id DESC")
    counts = {}
    for key, table, column in ACTIVITY:
        for row in db.query(f"SELECT user_id, COUNT(*) AS n, MAX({column}) AS last FROM {table} GROUP BY user_id"):
            counts.setdefault(row["user_id"], {})[key] = (row["n"], row["last"])
    out = []
    for person in people:
        mine = counts.get(person["id"], {})
        out.append({"id": person["id"], "name": person["name"] or "", "email": person["email"],
                    "sign_in": sign_in_methods(bool(person["password_hash"]), bool(person["google_sub"])),
                    "joined": person["created_at"], "language": person["preferred_language"], "daily_minutes": person["daily_study_minutes"],
                    "exam_date": person["target_exam_date"],
                    "last_active": latest(*(mine.get(key, (0, None))[1] for key, _, _ in ACTIVITY)),
                    "activity": {key: mine.get(key, (0, None))[0] for key, _, _ in ACTIVITY}})
    return out
