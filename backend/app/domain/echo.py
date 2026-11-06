"""Telling the student apart from the tutor's own voice coming back through the speakers (pure).

Without headphones the microphone hears the tutor reading "A, B, C or D" and Gemini takes it for the student's answer. These rules decide
what to ignore: anything heard while the tutor is speaking and for a moment after, one word right after the tutor, and anything that
repeats what the tutor just said.
"""
import difflib
import re

TAIL_SECONDS = 0.8      # after the tutor's audio ends, the room still rings: nothing counts yet
SHORT_SECONDS = 1.5     # a message of fewer than 2 words this soon after the tutor is treated as echo
PCM_BYTES_PER_SECOND = 48000   # the tutor's audio: 24 kHz, 16-bit, mono
_SIMILAR = 0.6
_LETTER_WORDS = {"a", "b", "c", "d", "option", "answer", "is", "the", "or", "and", "its", "it", "ans", "number"}


def audio_seconds(byte_count: int) -> float:
    return byte_count / PCM_BYTES_PER_SECOND


def normalise(text: str) -> str:
    return " ".join(re.findall(r"[\w']+", str(text).lower()))


def is_echo(text: str, *, seconds_since_tutor: float, test_open: bool, last_tutor_text: str = "") -> bool:
    """`seconds_since_tutor` is negative while the tutor is still speaking. `test_open` means a graded test is under way."""
    said = normalise(text)
    if not said:
        return False
    if test_open and seconds_since_tutor < TAIL_SECONDS:
        return True                                   # the tutor is speaking, or just stopped: whatever came in is its own voice
    if len(said.split()) < 2 and seconds_since_tutor < SHORT_SECONDS:
        return True                                   # one word right after the tutor spoke
    last = normalise(last_tutor_text)
    if last:
        if len(said) >= 8 and said in last:
            return True                               # a piece of what the tutor just said
        if difflib.SequenceMatcher(None, said, last).ratio() >= _SIMILAR:
            return True
    return False


def is_letter_answer(text: str) -> bool:
    """"D", "option b", "a b c or d": an answer that is only letters. In a test these are accepted only when tapped or typed, never when heard."""
    tokens = re.findall(r"[a-z]+", str(text).lower())
    return bool(tokens) and all(token in _LETTER_WORDS for token in tokens) and any(len(token) == 1 and token in "abcd" for token in tokens)
