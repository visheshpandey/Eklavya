"""A cheap check on what the tutor says, run after the model has written it (pure: no network).

The prompts (prompts/language_rules.md) ask for clean Hinglish, but a model can still slip: a Turkish word, Devanagari inside a
Roman-script line, or "bhai". ``violations`` finds those; the Ask tutor regenerates once when it finds any and ``clean`` removes
what remains. The live voice call cannot be edited after it is spoken, so a slip there is logged and the model is reminded.
"""
import re
import unicodedata

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


# tool-call markup the model sometimes writes into its spoken text ("<function_calls> <tool ..."): never shown to the student
_TOOL_BLOCK = re.compile(r"<\s*(function_calls|tool_calls?|tool_code|invoke)\b.*?(?:<\s*/\s*\1\s*>|$)", re.I | re.S)
_TOOL_TAG = re.compile(r"<\s*/?\s*(?:function_calls|tool_calls?|tool_code|tool|invoke|parameter)\b[^>]*>?", re.I)


def strip_markup(text: str) -> str:
    """Remove tool-call markup (a whole <function_calls> block, or stray tags) from tutor text; spaces left behind are tidied."""
    out = _TOOL_TAG.sub("", _TOOL_BLOCK.sub("", text))
    return out if out == text else re.sub(r"[ 	]{2,}", " ", out).strip()


_KEEP_SCRIPTS = ("LATIN", "DEVANAGARI", "GREEK")   # Greek letters appear in maths (alpha, beta, sigma)


def _allowed(ch: str) -> bool:
    if not unicodedata.category(ch).startswith(("L", "M")):
        return True                                      # digits, punctuation, symbols, spaces
    if unicodedata.category(ch).startswith("M"):         # a combining mark: Devanagari signs, or an accent on a Latin letter
        return unicodedata.name(ch, "").startswith(("DEVANAGARI", "COMBINING"))
    return unicodedata.name(ch, "").startswith(_KEEP_SCRIPTS)


def strip_foreign_scripts(text: str) -> str:
    """Remove every letter that is not Latin or Devanagari (a Bengali, Tamil or Urdu word that slipped into a Hinglish line);
    digits, punctuation and symbols stay. Spaces left behind are tidied."""
    if all(_allowed(c) for c in text):
        return text
    return re.sub(r"[ 	]{2,}", " ", "".join(c for c in text if _allowed(c))).replace(" ,", ",").replace(" .", ".")


def violations(text: str, language: str) -> list:
    """What is wrong with ``text`` for the tutor language ('english' | 'hinglish' | 'hindi'); an empty list means it is fine."""
    found = []
    if _PET.search(text):
        found.append("a pet name such as bhai/yaar/dost (address the student as aap)")
    if language in ("hinglish", "english") and _DEVANAGARI.search(text):
        found.append("Devanagari letters (write Hindi words in Roman letters)")
    if _FOREIGN_LETTERS.search(text) or _OTHER_SCRIPTS.search(text) or _FOREIGN_WORDS.search(text) or strip_foreign_scripts(text) != text:
        found.append("words from a language other than Hindi or English")
    if language == "hinglish" and _TUM.search(text):
        found.append("the casual tum/tu form (use aap)")
    return found


def clean(text: str, language: str) -> str:
    """Remove what ``violations`` would flag where that can be done safely: pet names, foreign words and scripts, and
    casual commands. Devanagari is left in place (it cannot be transliterated reliably); the regenerate step handles it."""
    text = _PET.sub("", text)
    text = strip_foreign_scripts(_OTHER_SCRIPTS.sub("", _FOREIGN_LETTERS.sub("", _FOREIGN_WORDS.sub("", text))))   # whole words first, then stray letters and any other script
    if language == "hinglish":
        text = _COMMAND.sub(lambda m: _RESPECT[m.group(1).lower()].capitalize() if m.group(1)[0].isupper() else _RESPECT[m.group(1).lower()], text)
    return re.sub(r"\s{2,}", " ", re.sub(r"\s+([,.!?])", r"\1", text)).strip()


REMINDER = ("[Style reminder, do not mention it: use only {rule}. Address the student as aap, never bhai, yaar, dost or tum. "
            "No words from other languages. Roman letters only for Hinglish (never Bengali, Tamil, Urdu or any other script); Devanagari only if the language is Hindi.]")
