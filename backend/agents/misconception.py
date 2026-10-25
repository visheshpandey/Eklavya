"""Misconception agent: name the root error behind a wrong answer.

Order: (1) the misconception stored with the chosen wrong option (no LLM, deterministic),
(2) Gemini classification against prompts/misconception_taxonomy.md. A Gemini failure raises.
"""
import os

import db
from gemini import llm_json
from agents.quiz import LABELS

_TAXONOMY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "prompts", "misconception_taxonomy.md")

SYSTEM = "You diagnose the root misconception behind a wrong answer. Respond with valid JSON only."


def _taxonomy():
    try:
        with open(_TAXONOMY_PATH, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ", ".join(LABELS)


def classify(question: dict, chosen_letter, student_answer: str):
    """question: a quiz_questions row. Returns {label, text, source}."""
    stored = db.loads(question.get("misconceptions"), {}) or {}
    entry = stored.get(chosen_letter) if chosen_letter else None
    if isinstance(entry, dict) and entry.get("text"):
        return {"label": entry.get("label") if entry.get("label") in LABELS else "definition_mixup",
                "text": entry["text"], "source": "stored"}
    if isinstance(entry, str) and entry:
        return {"label": "definition_mixup", "text": entry, "source": "stored"}

    options = db.loads(question.get("options"), [])
    prompt = f"""{_taxonomy()}

Now diagnose this one.
Question: {question['question']}
Options: {options}
Correct answer: {question['correct']}
Student answered: {student_answer}
Return JSON {{"label": "<one label from the table>", "misconception_text": "one sentence naming the wrong belief"}}"""
    d = llm_json(SYSTEM, prompt, required_keys=("label", "misconception_text"), temperature=0.2)
    return {"label": d["label"] if d["label"] in LABELS else "guess_or_unknown",
            "text": d["misconception_text"], "source": "gemini"}
