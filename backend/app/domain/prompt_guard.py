"""Prompt hardening checks (pure): spot a request for the tutor's instructions, and a reply that talks about them.

The rule itself is in prompts/prompt_safety.md and is sent with every Gemini call. A typed Ask answer can still be checked before it
is shown: one that leaks is replaced with a short decline that steers back to studying.
"""
import re

ASKS_FOR_INSTRUCTIONS = re.compile(
    r"ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)|"
    r"(system|developer|hidden|initial) (prompt|instructions?|message)|"
    r"(print|show|reveal|repeat|tell|give|share|describe|output|display|leak)( me)? ((your|the) (instructions|prompt)|your (rules|guidelines|configuration))|"
    r"(your|the) (instructions|prompt) (above|verbatim|word for word)|"
    r"what (are|were) your (instructions|rules)|jailbreak|\bDAN mode\b",
    re.IGNORECASE)

LEAK_MARKERS = re.compile(
    r"system (prompt|instruction)|my (instructions|prompt|guidelines)|i (was|am|have been) (instructed|told|programmed)|"
    r"\bused_notes\b|\bfollow_up_question\b|\bsource_topic\b|respond with valid json|output format|"
    r"instructions (say|tell|are)|aap(ke)? (instructions|prompt)",
    re.IGNORECASE)

DECLINE = {
    "english": "I can't share that. Let's get back to your studies: which topic would you like to go over?",
    "hinglish": "Ye main share nahi kar sakta. Chaliye padhai par wapas aate hain: aap kaunsa topic samajhna chahenge?",
    "hindi": "यह मैं साझा नहीं कर सकता। चलिए पढ़ाई पर लौटते हैं: आप कौन-सा टॉपिक समझना चाहेंगे?",
}
FOLLOW_UP = {
    "english": "Which topic should we revise first?",
    "hinglish": "Pehle kaunsa topic revise karein?",
    "hindi": "पहले कौन-सा टॉपिक दोहराएँ?",
}


def asks_for_instructions(text: str) -> bool:
    """True when the student asks the tutor to reveal or describe its instructions (an ordinary off-topic question is not)."""
    return bool(ASKS_FOR_INSTRUCTIONS.search(text or ""))


def leaks(question: str, answer: str) -> bool:
    """True when a reply talks about the tutor's instructions or reply format and must not be shown."""
    if LEAK_MARKERS.search(answer or ""):
        return True
    return asks_for_instructions(question) and bool(re.search(r"\b(instructions?|prompt|rules)\b", answer or "", re.IGNORECASE))


def decline(language: str) -> dict:
    """The short decline shown instead, in the student's language."""
    return {"answer": DECLINE.get(language, DECLINE["hinglish"]), "follow_up_question": FOLLOW_UP.get(language, FOLLOW_UP["hinglish"])}
