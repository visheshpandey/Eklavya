"""Viva marks and debate scores (pure): clamp what the model reports and turn it into results."""

VIVA_QUESTIONS = 5
VIVA_MAX_PER_QUESTION = 2          # 5 questions x 2 marks = marks out of 10
DEBATE_MAX = 10


def clamp(value, low: float, high: float, default: float) -> float:
    try:
        return min(max(float(value), low), high)
    except (TypeError, ValueError):
        return default


def viva_mark(score) -> float:
    """One answer's mark, 0-2 in half marks."""
    return round(clamp(score, 0, VIVA_MAX_PER_QUESTION, 0) * 2) / 2


def viva_counts_as_correct(mark: float) -> bool:
    """For mastery: at least half marks on an answer counts as knowing it."""
    return mark >= VIVA_MAX_PER_QUESTION / 2


def viva_total(marks) -> dict:
    marks = list(marks)
    total = sum(marks)
    out_of = VIVA_MAX_PER_QUESTION * (len(marks) or VIVA_QUESTIONS)
    return {"marks": total, "out_of": out_of, "percent": round(100 * total / out_of)}


def argument_score(evidence, logic, rebuttal) -> dict:
    """One student turn in a debate: three 0-10 scores and their average as overall strength."""
    parts = {name: round(clamp(value, 0, DEBATE_MAX, 0), 1)
             for name, value in (("evidence", evidence), ("logic", logic), ("rebuttal", rebuttal))}
    return {**parts, "strength": round(sum(parts.values()) / 3, 1)}


def debate_winner(student: float, tutor: float) -> str:
    if abs(student - tutor) < 0.5:
        return "draw"
    return "student" if student > tutor else "eklavya"
