"""Student feedback: three questions asked once after a lesson or some flashcards, and the counts shown on "Why Eklavya"."""
from app import db
from app.errors import BadRequestError

EASIER = ("yes", "same", "no")
TRUST = ("yes", "no")
MIN_FOR_SUMMARY = 5   # below this, no number is shown: a handful of answers is not evidence


def save(user_id: int, easier: str, trust: str, rating: int) -> dict:
    """One answer per student: a second submit replaces the first."""
    if easier not in EASIER or trust not in TRUST or not isinstance(rating, int) or not 1 <= rating <= 5:
        raise BadRequestError("Please answer all three questions.")
    db.execute("DELETE FROM feedback WHERE user_id = ?", (user_id,))
    db.execute("INSERT INTO feedback (user_id, easier, trust, rating) VALUES (?, ?, ?, ?)", (user_id, easier, trust, rating))
    return {"saved": True}


def given(user_id: int) -> bool:
    return bool(db.one("SELECT id FROM feedback WHERE user_id = ?", (user_id,)))


def summary() -> dict:
    """{responses, easier_yes, trust_yes, average_rating}, or {responses} alone while there are too few answers."""
    rows = db.query("SELECT easier, trust, rating FROM feedback")
    count = len(rows)
    if count < MIN_FOR_SUMMARY:
        return {"responses": count}
    return {"responses": count,
            "easier_yes": sum(1 for r in rows if r["easier"] == "yes"),
            "trust_yes": sum(1 for r in rows if r["trust"] == "yes"),
            "average_rating": round(sum(r["rating"] for r in rows) / count, 1)}
