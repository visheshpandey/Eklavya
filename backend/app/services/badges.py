"""GET /api/badges: the student's achievements, worked out from what they have done (nothing is stored)."""
from app import db
from app.domain.badges import evaluate, longest_streak
from app.services.challenges import wins
from app.services.progress_data import active_days

MIN_MOCK_QUESTIONS = 5   # a 1-question "exam" does not earn the exam badge


def stats(user_id: int) -> dict:
    count = lambda sql: db.one(sql, (user_id,))["n"] or 0   # noqa: E731 - one-line helper for the counts below
    best_mock = db.one("SELECT MAX(100 * correct / total) AS n FROM mock_exams WHERE user_id = ? AND finished_at IS NOT NULL "
                       f"AND total >= {MIN_MOCK_QUESTIONS}", (user_id,))["n"]
    return {
        "documents": count("SELECT COUNT(*) AS n FROM documents WHERE user_id = ?"),
        "answers": count("SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = ?"),
        "correct": count("SELECT SUM(is_correct) AS n FROM quiz_attempts WHERE user_id = ?"),
        "best_streak": longest_streak(active_days(user_id)),
        "mastered": count("SELECT COUNT(*) AS n FROM learner_mastery m JOIN topics t ON t.id = m.topic_id "
                          "WHERE m.user_id = ? AND m.mastery_score >= 80"),
        "vivas": count("SELECT COUNT(*) AS n FROM vivas WHERE user_id = ? AND finished_at IS NOT NULL"),
        "debate_wins": count("SELECT COUNT(*) AS n FROM debates WHERE user_id = ? AND winner = 'student'"),
        "cards_reviewed": count("SELECT COUNT(*) AS n FROM flashcards WHERE user_id = ? AND reviewed_at IS NOT NULL"),
        "best_mock": int(best_mock or 0),
        "doubts": count("SELECT COUNT(*) AS n FROM doubts WHERE user_id = ?"),
        "groups": count("SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?"),
        "challenge_wins": wins(user_id),
    }


def badges(user_id: int) -> dict:
    items = evaluate(stats(user_id))
    return {"badges": items, "earned": sum(b["earned"] for b in items), "total": len(items)}
