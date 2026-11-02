"""Pure mastery math (no I/O) so it is unit-testable and explainable.

Evidence moves a topic's mastery (0-100) in four ways, all small and bounded:
  quiz / voice answer   correct  +CORRECT_GAIN * (1 - mastery/100);  wrong  -WRONG_PENALTY * confidence
  flashcard rating      Got it  +(2 + 6 * (1 - mastery/100));  Hard  +1.5 * (1 - mastery/100);  Again  -CARD_AGAIN
  viva / debate         move toward the marked score by VIVA_WEIGHT of the gap
  time                  a topic left alone slowly fades toward FADE_FLOOR of its value (a forgetting curve): see `faded`
A topic with no evidence at all is "not started": it has no percentage to show (the stored 50 is only a neutral placeholder).
"""
import math

CORRECT_GAIN = 15
WRONG_PENALTY = 10
CARD_AGAIN = 4
VIVA_WEIGHT = 0.35
FADE_FLOOR = 0.55          # a long-forgotten topic keeps at least this share of its mastery
BASE_STABILITY_DAYS = 6    # how many days until recall drops to 1/e with a single piece of evidence


def _clamp(value: float) -> float:
    return round(min(max(value, 0.0), 100.0), 1)


def update_mastery(mastery: float, is_correct: bool, confidence: float = 0.5) -> float:
    confidence = min(max(confidence, 0.0), 1.0)
    if is_correct:
        new = mastery + CORRECT_GAIN * (1 - mastery / 100)
    else:
        new = mastery - WRONG_PENALTY * confidence
    return _clamp(new)


def card_update(mastery: float, rating: str) -> float:
    """A flashcard rating: 'known' (Got it), 'hard' or 'again'."""
    room = 1 - mastery / 100
    if rating == "known":
        return _clamp(mastery + 2 + 6 * room)
    if rating == "hard":
        return _clamp(mastery + 1.5 * room)
    return _clamp(mastery - CARD_AGAIN)


def marked_update(mastery: float, score_percent: float, weight: float = VIVA_WEIGHT) -> float:
    """A marked performance (viva or debate): mastery moves toward the score by `weight` of the gap."""
    return _clamp(mastery + weight * (min(max(score_percent, 0.0), 100.0) - mastery))


def faded(mastery: float, days_since: float, evidence: int = 1) -> float:
    """What mastery shows after `days_since` days without practice. More evidence makes memory last longer
    (stability grows with it); the value never falls below FADE_FLOOR of what was earned."""
    if days_since <= 0 or evidence <= 0:
        return round(mastery, 1)
    stability = BASE_STABILITY_DAYS * (1 + evidence) ** 0.8
    retention = math.exp(-days_since / stability)
    floor = mastery * FADE_FLOOR
    return round(floor + (mastery - floor) * retention, 1)


def severity_for(confidence: float) -> str:
    """A confident wrong answer is a stronger sign of a real misconception."""
    if confidence >= 0.7:
        return "high"
    if confidence >= 0.4:
        return "medium"
    return "low"
