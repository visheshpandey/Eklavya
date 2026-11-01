"""A cheap check on what the tutor says, run after the model has written it (pure: no network).

The prompts (prompts/language_rules.md) ask for clean Hinglish, but a model can still slip: a Turkish word, Devanagari inside a
Roman-script line, or "bhai". ``violations`` finds those; the Ask tutor regenerates once when it finds any and ``clean`` removes
what remains. The live voice call cannot be edited after it is spoken, so a slip there is logged and the model is reminded.
"""
import re

PET_NAMES = ("bhai", "bhaiya", "bro", "dude", "yaar", "dost", "beta", "beti", "buddy")
_PET = re.compile(r"\b(?:" + "|".join(PET_NAMES) + r")\b[,!.]?\s*", re.I)
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
# letters Turkish uses and Hindi or English never do, plus other scripts a Hindi/English tutor has no reason to write
_FOREIGN_LETTERS = re.compile("[ıİşŞğĞ]")
_OTHER_SCRIPTS = re.compile("[Ѐ-ӿ֐-׿؀-ۿ฀-๿぀-ヿ一-鿿가-힯]")
_FOREIGN_WORDS = re.compile(r"\b(?:asl[iı]nda|de[gğ]il|tamam|[cç]ünkü|evet|hay[iı]r|teşekkür|gracias|pero|porque|merci|danke)\b", re.I)
_TUM = re.compile(r"\b(?:tum|tumhe|tumhara|tumhari|tumhare|tu|tujhe)\b", re.I)
# a command in the casual "tu" form, turned into the respectful form
_RESPECT = {"dekh": "dekhiye", "sun": "suniye", "bol": "boliye", "soch": "sochiye", "batao": "batayein", "bolo": "boliye", "suno": "suniye", "dekho": "dekhiye"}
_COMMAND = re.compile(r"\b(" + "|".join(_RESPECT) + r")\b", re.I)


def violations(text: str, language: str) -> list:
    """What is wrong with ``text`` for the tutor language ('english' | 'hinglish' | 'hindi'); an empty list means it is fine."""
    found = []
    if _PET.search(text):
        found.append("a pet name such as bhai/yaar/dost (address the student as aap)")
    if language in ("hinglish", "english") and _DEVANAGARI.search(text):
        found.append("Devanagari letters (write Hindi words in Roman letters)")
    if _FOREIGN_LETTERS.search(text) or _OTHER_SCRIPTS.search(text) or _FOREIGN_WORDS.search(text):
        found.append("words from a language other than Hindi or English")
    if language == "hinglish" and _TUM.search(text):
        found.append("the casual tum/tu form (use aap)")
    return found


def clean(text: str, language: str) -> str:
    """Remove what ``violations`` would flag where that can be done safely: pet names, foreign words and scripts, and
    casual commands. Devanagari is left in place (it cannot be transliterated reliably); the regenerate step handles it."""
    text = _PET.sub("", text)
    text = _OTHER_SCRIPTS.sub("", _FOREIGN_LETTERS.sub("", _FOREIGN_WORDS.sub("", text)))   # whole words first, then stray letters
    if language == "hinglish":
        text = _COMMAND.sub(lambda m: _RESPECT[m.group(1).lower()].capitalize() if m.group(1)[0].isupper() else _RESPECT[m.group(1).lower()], text)
    return re.sub(r"\s{2,}", " ", re.sub(r"\s+([,.!?])", r"\1", text)).strip()


REMINDER = ("[Style reminder, do not mention it: use only {rule}. Address the student as aap, never bhai, yaar, dost or tum. "
            "No words from other languages.]")
