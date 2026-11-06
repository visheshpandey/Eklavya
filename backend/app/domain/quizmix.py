"""Mixing the answer options of a quiz question (pure), so the right answer is not always the same letter.

Questions are stored with letters ("A. text"), the right letter, and a misconception per wrong letter. Mixing re-letters the options and
moves the right letter and the misconception keys with them, so grading and the misconception diagnosis stay exactly right.
"""
import os
import random
import re

_LEADING_LETTER = re.compile(r"^\s*[A-Da-d][.):]\s*")
# an option that points at other options ("All of the above", "Both A and B") loses its meaning if the order changes
_REFERS_TO_OTHERS = re.compile(r"\b(all|none|neither|both|any)\b.{0,12}\b(above|these|options?)\b|\b[A-D]\s*(and|&|or)\s*[A-D]\b|\bboth\b", re.I)


def can_mix(options) -> bool:
    return len(options) in (3, 4) and not any(_REFERS_TO_OTHERS.search(str(option)) for option in options)


def mix_question(options, correct, misconceptions=None, rng=None):
    """Returns (options, correct, misconceptions) with the options in a new order and the letters following them.

    Questions whose options refer to each other, or that do not have 3 or 4 options, are returned unchanged."""
    misconceptions = dict(misconceptions or {})
    correct = str(correct).strip().upper()[:1]
    # QUIZ_MIX=off keeps the stored order (the older tests script their answers by letter); an explicit `rng` always mixes
    if not can_mix(options) or (rng is None and os.environ.get("QUIZ_MIX", "").lower() == "off"):
        return list(options), correct, misconceptions
    rng = rng or random
    letters = "ABCD"[:len(options)]
    texts = [_LEADING_LETTER.sub("", str(option)).strip() for option in options]
    order = list(range(len(texts)))
    rng.shuffle(order)
    new_letter = {letters[old]: letters[new] for new, old in enumerate(order)}   # old letter -> new letter
    mixed = [f"{letters[new]}. {texts[old]}" for new, old in enumerate(order)]
    return mixed, new_letter.get(correct, correct), {new_letter.get(key, key): value for key, value in misconceptions.items()}
