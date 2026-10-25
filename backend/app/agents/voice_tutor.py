"""Text tutor (POST /api/tutor/ask): retrieve chunks, answer from the notes in the chosen language.

The live voice tutor (P3) reaches the same retrieval through the search_notes tool.
"""
from app.agents.logger import log_agent
from app.ai.gemini import llm_json
from app.domain import retrieval
from app.errors import BadRequestError

LANG_RULES = {
    "english": "Reply in simple English.",
    "hindi": "Reply in simple Hindi (Devanagari), keeping technical terms in English.",
    "hinglish": "Reply in natural Hinglish (Hindi written in Roman letters mixed with English terms), like a friendly senior student.",
}
SYSTEM = ("You are Eklavya, a warm study mentor. Answer ONLY from the notes provided. "
          "Keep it short (3-5 sentences) with one simple example. Respond with valid JSON only.")


def ask(user_id: int, question: str, language: str = "hinglish", document_id: int = None):
    document_id = document_id or retrieval.latest_document_id(user_id)
    if not document_id:
        raise BadRequestError("No notes uploaded yet. Upload a document first.")
    chunks = retrieval.retrieve(document_id, question)
    if not chunks:
        log_agent(user_id, "voice_tutor", f"Question: {question}", "No matching notes found", "Told student it is not in the notes", 0.3)
        return {"answer": "I could not find this in your notes. Try rephrasing, or upload the chapter that covers it.",
                "source_document": None, "source_topic": None, "follow_up_question": None,
                "grounded": False}

    notes = "\n\n".join(f"[{c['topic']} / {c['heading']}] {c['text']}" for c in chunks)
    prompt = f"""{LANG_RULES.get(language, LANG_RULES['hinglish'])}
Student question: {question}

Notes:
{notes}

Return JSON {{"answer": "...", "follow_up_question": "one short question that checks understanding", "source_topic": "topic name you used"}}"""
    d = llm_json(SYSTEM, prompt, required_keys=("answer", "follow_up_question"), temperature=0.5)
    top = chunks[0]
    out = {"answer": d["answer"], "follow_up_question": d["follow_up_question"],
           "source_topic": d.get("source_topic") or top["topic"]}
    out.update({"source_document": document_id, "grounded": True, "chunks_used": len(chunks)})
    log_agent(user_id, "voice_tutor", f"Question: {question} [{language}]",
              f"Retrieved {len(chunks)} chunks, best: {top['topic']} ({top['score']})",
              "Answered from notes", 0.8)
    return out
