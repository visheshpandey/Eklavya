"""Text tutor (POST /api/tutor/ask): retrieve chunks, answer from the notes in the chosen language.

Every question and answer is kept as a "doubt" (see app/services/doubts.py), and the last two are sent along so a
follow-up such as "and recall?" makes sense. The live voice tutor reaches the same retrieval through search_notes.
"""
import logging
import time

from app import db
from app.agents.logger import log_agent
from app.ai.gemini import llm_json
from app.domain import language_check, retrieval
from app.errors import BadRequestError
from app.services.search import search

LANG_RULES = {
    "english": "Reply in simple English.",
    "hindi": "Reply in simple Hindi (Devanagari), keeping technical terms in English.",
    "hinglish": "Reply in clear Hinglish: Hindi words written in Roman letters (never Devanagari) mixed with English terms.",
}
SYSTEM = ("You are Eklavya, a warm, respectful study mentor. Answer ONLY from the notes provided. "
          "Keep it short (3-5 sentences) with one simple example. Address the student as aap (or you), gender-neutral, and "
          "never use bhai, yaar, dost, bro or tum. Use only Hindi and English words, no other language. "
          "Respond with valid JSON only.")


log = logging.getLogger(__name__)
CONTEXT_DOUBTS = 2


def _save(user_id: int, question: str, out: dict) -> dict:
    out["doubt_id"] = db.execute(
        "INSERT INTO doubts (user_id, question, answer, follow_up, topic, grounded) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, question, out["answer"], out.get("follow_up_question"), out.get("source_topic"), int(out["grounded"])))
    return out


MATCH_STRONG = 0.6   # at least this share of the question's words found in the passages


def _evidence(question: str, chunks, searched: int, search_ms: int) -> dict:
    """What the screen shows under the answer: the passages used, how well they match, how many were searched."""
    used = chunks[:2]
    share = retrieval.coverage(question, used)
    return {"sources": [{"document": c.get("document") or "", "topic": c["topic"], "heading": c["heading"], "text": c["text"]} for c in used],
            "terms": sorted(set(retrieval.tokenize(question))), "searched": searched,
            "ms": search_ms,
            "match": "none" if not used else "strong" if share >= MATCH_STRONG else "partial"}


def ask(user_id: int, question: str, language: str = "hinglish", document_id: int = None):
    if not document_id and not retrieval.has_notes(user_id):
        raise BadRequestError("No notes uploaded yet. Upload a document first.")
    started = time.perf_counter()
    chunks = search(user_id, question, document_id)
    search_ms = round((time.perf_counter() - started) * 1000)   # the search only, not Gemini writing the answer
    searched = retrieval.count_chunks(user_id, document_id)
    if not chunks:
        log_agent(user_id, "voice_tutor", f"Question: {question}", "No matching notes found", "Told student it is not in the notes", 0.3)
        return _save(user_id, question, {
            "answer": "I could not find this in your notes. Try rephrasing, or upload the chapter that covers it.",
            "source_document": None, "source_topic": None, "follow_up_question": None, "grounded": False,
            **_evidence(question, [], searched, search_ms)})

    notes = "\n\n".join(f"[{c['topic']} / {c['heading']}] {c['text']}" for c in chunks)
    earlier = db.query("SELECT question, answer FROM doubts WHERE user_id = ? ORDER BY id DESC LIMIT ?", (user_id, CONTEXT_DOUBTS))
    chat = "".join(f"Student: {d['question']}\nYou: {d['answer']}\n" for d in reversed(earlier))
    context = f"Earlier in this chat (use it only to understand a follow-up question):\n{chat}" if chat else ""
    prompt = f"""{LANG_RULES.get(language, LANG_RULES['hinglish'])}
{context}
Student question: {question}

Notes:
{notes}

Return JSON {{"answer": "...", "follow_up_question": "one short question that checks understanding", "source_topic": "topic name you used"}}"""
    d = llm_json(SYSTEM, prompt, required_keys=("answer", "follow_up_question"), temperature=0.5)
    slips = language_check.violations(f"{d['answer']} {d['follow_up_question']}", language)
    if slips:   # the model slipped (a stray word from another language, Devanagari in Hinglish, "bhai"): ask once more, then clean up
        log.warning("Ask answer slipped (%s): %s", language, "; ".join(slips))
        d = llm_json(SYSTEM, prompt + f"\n\nYour last answer contained: {'; '.join(slips)}. Write it again without them.",
                     required_keys=("answer", "follow_up_question"), temperature=0.3)
        d["answer"] = language_check.clean(d["answer"], language)
        d["follow_up_question"] = language_check.clean(d["follow_up_question"], language)
    top = chunks[0]
    out = {"answer": d["answer"], "follow_up_question": d["follow_up_question"],
           "source_topic": d.get("source_topic") or top["topic"]}
    out.update({"source_document": top["document_id"], "grounded": True, "chunks_used": len(chunks),
                **_evidence(question, chunks, searched, search_ms)})
    log_agent(user_id, "voice_tutor", f"Question: {question} [{language}]",
              f"Retrieved {len(chunks)} chunks, best: {top['topic']} ({top['score']})",
              "Answered from notes", 0.8)
    return _save(user_id, question, out)
