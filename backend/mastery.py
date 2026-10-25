"""Pure mastery-update math (no I/O) so it is unit-testable and explainable on stage.

PRD s9: correct answer  +CORRECT_GAIN * (1 - mastery/100)
        wrong answer    -WRONG_PENALTY * confidence
        clamped to 0-100.
"""
from config import CORRECT_GAIN, WRONG_PENALTY


def update_mastery(mastery: float, is_correct: bool, confidence: float = 0.5) -> float:
    confidence = min(max(confidence, 0.0), 1.0)
    if is_correct:
        new = mastery + CORRECT_GAIN * (1 - mastery / 100)
    else:
        new = mastery - WRONG_PENALTY * confidence
    return round(min(max(new, 0.0), 100.0), 1)


def severity_for(confidence: float) -> str:
    """A confident wrong answer is a stronger sign of a real misconception."""
    if confidence >= 0.7:
        return "high"
    if confidence >= 0.4:
        return "medium"
    return "low"
