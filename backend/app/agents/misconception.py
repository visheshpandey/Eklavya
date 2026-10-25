"""Misconception agent: name the root error behind a wrong answer.

Order: (1) the misconception stored with the chosen wrong option (no LLM, deterministic),
(2) Gemini classification against ``prompts/misconception_taxonomy.md``.
A Gemini failure raises ``LLMError``; there is no generic fallback text.
"""
from app import db
from app.ai import prompts
from app.ai.gemini import llm_json
from app.domain import misconceptions as taxonomy

SYSTEM = "You diagnose the root misconception behind a wrong answer. Respond with valid JSON only."


def classify(question: dict, chosen_letter: str | None, student_answer: str) -> dict:
    """``question`` is a quiz_questions row. Returns ``{label, text, source}``."""
    stored = db.loads(question.get("misconceptions"), {}) or {}
    entry = stored.get(chosen_letter) if chosen_letter else None
    if isinstance(entry, dict) and entry.get("text"):
        return {"label": taxonomy.normalize(entry.get("label"), taxonomy.DEFAULT_STORED_LABEL),
                "text": entry["text"], "source": "stored"}
    if isinstance(entry, str) and entry:
        return {"label": taxonomy.DEFAULT_STORED_LABEL, "text": entry, "source": "stored"}

    options = db.loads(question.get("options"), [])
    prompt = f"""{prompts.load("misconception_taxonomy.md")}

Now diagnose this one.
Question: {question['question']}
Options: {options}
Correct answer: {question['correct']}
Student answered: {student_answer}
Return JSON {{"label": "<one label from the table>", "misconception_text": "one sentence naming the wrong belief"}}"""
    data = llm_json(SYSTEM, prompt, required_keys=("label", "misconception_text"), temperature=0.2)
    return {"label": taxonomy.normalize(data["label"]), "text": data["misconception_text"], "source": "gemini"}
