"""Study streak: how many days in a row the student studied (pure)."""
from datetime import date, timedelta


def study_streak(active_days, today: date) -> int:
    """Consecutive days with activity ending today, or ending yesterday if today has none yet
    (a streak is not lost until the day is over). ``active_days`` is any iterable of ``date``."""
    days = set(active_days)
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak
