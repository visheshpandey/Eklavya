"""Badges: which achievements a student has earned, from plain counts (pure, no database).

Each badge reads one number from the stats and has a goal; ``progress`` lets the screen show "3 of 7" for a locked one.
"""
from datetime import timedelta

# (id, title, how to earn it, stat it reads, goal, icon name)
BADGES = (
    ("first-notes", "First notes", "Add your first notes", "documents", 1, "notebook"),
    ("first-answer", "First answer", "Answer your first question", "answers", 1, "check-circle"),
    ("sharp-50", "Sharp mind", "Get 50 answers right", "correct", 50, "target"),
    ("streak-3", "On a roll", "Study 3 days in a row", "best_streak", 3, "fire"),
    ("streak-7", "One week strong", "Study 7 days in a row", "best_streak", 7, "fire"),
    ("streak-30", "Unstoppable", "Study 30 days in a row", "best_streak", 30, "fire"),
    ("mastered-1", "Got it", "Reach 80% mastery on a topic", "mastered", 1, "star"),
    ("mastered-5", "Topic master", "Reach 80% mastery on 5 topics", "mastered", 5, "star"),
    ("viva", "Viva ready", "Finish a viva", "vivas", 1, "microphone"),
    ("debate-win", "Debate winner", "Win a debate against Eklavya", "debate_wins", 1, "trophy"),
    ("cards-25", "Card shark", "Review 25 flashcards", "cards_reviewed", 25, "cards"),
    ("mock-80", "Exam ready", "Score 80% or more in a mock exam", "best_mock", 80, "exam"),
    ("curious", "Curious", "Ask the tutor 10 doubts", "doubts", 10, "chat"),
    ("team", "Team player", "Join a study group", "groups", 1, "users"),
    ("challenger", "Challenger", "Win a challenge against a friend", "challenge_wins", 1, "sword"),
)


def longest_streak(active_days) -> int:
    """The longest run of consecutive days in ``active_days`` (any iterable of ``date``)."""
    days = set(active_days)
    best = 0
    for day in days:
        if day - timedelta(days=1) in days:
            continue   # not the start of a run
        length = 1
        while day + timedelta(days=length) in days:
            length += 1
        best = max(best, length)
    return best


def evaluate(stats: dict) -> list:
    """[{id, title, description, icon, earned, progress, goal}] in a fixed order: earned ones are not moved."""
    out = []
    for badge_id, title, description, stat, goal, icon in BADGES:
        value = int(stats.get(stat) or 0)
        out.append({"id": badge_id, "title": title, "description": description, "icon": icon,
                    "earned": value >= goal, "progress": min(value, goal), "goal": goal})
    return out

