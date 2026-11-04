"""Today's goal: a small, doable number of study actions (an answered question or a rated flashcard), counted from what the student really did today."""
from datetime import date

from app import db
from app.services.progress_data import local_date

DAILY_GOAL = 5   # actions a day: about ten minutes, enough to keep a streak going without feeling like a chore


def progress(done: int, target: int = DAILY_GOAL) -> dict:
    """Pure: {done, target, left, reached}. `done` may pass the target; the ring just stays full."""
    done = max(0, int(done))
    return {"done": done, "target": target, "left": max(0, target - done), "reached": done >= target}


def actions_on(user_id: int, day: date) -> int:
    """Answered questions plus rated flashcards on this local day (the same two things that keep the streak)."""
    stamps = [r["t"] for r in db.query("SELECT answered_at AS t FROM quiz_attempts WHERE user_id = ?", (user_id,))]
    stamps += [r["t"] for r in db.query("SELECT reviewed_at AS t FROM flashcards WHERE user_id = ? AND reviewed_at IS NOT NULL", (user_id,))]
    return sum(1 for stamp in stamps if local_date(stamp) == day)
