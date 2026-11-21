"""Text tutor (POST /api/tutor/ask): retrieve chunks, answer from the notes in the chosen language.

Every question and answer is kept as a "doubt" (see app/services/doubts.py), and the last two are sent along so a
follow-up such as "and recall?" makes sense. The live voice tutor reaches the same retrieval through search_notes.
"""
import logging
import time

from app import db
from app.agents.logger import log_agent
from app.ai.gemini import llm_json
from app.domain import language_check, prompt_guard, retrieval
from app.errors import BadRequestError, LLMError
from app.services import usage
from app.services.search import search

LANG_RULES = {
    "english": "Reply in simple English.",
    "hindi": "Reply in simple Hindi (Devanagari only, never Bengali, Tamil, Urdu or any other script), keeping technical terms in English.",
    "hinglish": "Reply in clear Hinglish: Hindi words written in Roman letters (never Devanagari) mixed with English terms. Write Hinglish using ONLY the Roman (English) alphabet: never Bengali, Tamil, Urdu or any other script.",
}
SYSTEM = ("You are Eklavya, a warm, respectful study mentor. Answer from the notes provided when they cover the question (unless told the notes "
          "only list the topic); a quick general question they do not cover is answered from general knowledge. "
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


OUTLINE_RULE = ("These notes are a syllabus: they only NAME the topic. Explain it from standard college-level knowledge, as it is "
                "taught for this syllabus, still short and with one simple example. Include this exact sentence once, translated into the reply's "
                "language: \"Your notes only list this topic, so this explanation is from general knowledge.\" Never invent what the notes say.")
MATCH_STRONG = 0.6   # at least this share of the question's words found in the passages


def _evidence(question: str, chunks, searched: int, search_ms: int) -> dict:
    """What the screen shows under the answer: the passages used, how well they match, how many were searched."""
    used = retrieval.relevant_sources(question, chunks)   # at most 3, only the relevant ones
    share = retrieval.coverage(question, used)
    return {"sources": [{"document": c.get("document") or "", "topic": c["topic"], "heading": c["heading"], "text": c["text"]} for c in used],
            "terms": sorted(set(retrieval.tokenize(question))), "searched": searched,
            "ms": search_ms,
            "match": "none" if not used else "strong" if share >= MATCH_STRONG else "partial"}


def _from_notes_only(user_id: int, question: str, chunks, evidence: dict) -> dict:
    """When Gemini cannot answer, show the best passage of the student's own notes, with its citation, instead of an error."""
    top = chunks[0]
    text = " ".join(top["text"].split())
    if len(text) > 420:
        text = text[:420].rsplit(" ", 1)[0] + "…"
    log_agent(user_id, "voice_tutor", f"Question: {question}", "Gemini unavailable", "Showed the best passage from the notes", 0.5)
    return _save(user_id, question, {
        "answer": f"The AI helper is busy right now, so here is what your notes say about it: {text}",
        "follow_up_question": None, "source_topic": top["topic"], "source_document": top["document_id"],
        "grounded": True, "chunks_used": len(chunks), "fallback": True, **evidence})


NOTES_OR_GENERAL_RULE = ("If the notes below do not really cover the question (for example a general-knowledge, news or sports question), "
                         "answer it briefly from general knowledge, never say or suggest it comes from the notes, and set used_notes to false. "
                         "Set used_notes to true only when your answer actually uses the notes.")


def is_general(used_notes, unrelated: bool, outline: bool) -> bool:
    """True when an answer must be shown as general knowledge, with no citation (pure). The model says whether it used the notes;
    when it does not say, a question that shares no word with the passages found is taken as general. A syllabus answer keeps its own label."""
    if outline:
        return False
    if isinstance(used_notes, bool):
        return not used_notes
    return unrelated


def _earlier(user_id: int) -> str:
    """The last questions and answers, so a follow-up such as "and recall?" makes sense."""
    earlier = db.query("SELECT question, answer FROM doubts WHERE user_id = ? ORDER BY id DESC LIMIT ?", (user_id, CONTEXT_DOUBTS))
    chat = "".join(f"Student: {d['question']}\nYou: {d['answer']}\n" for d in reversed(earlier))
    return f"Earlier in this chat (use it only to understand a follow-up question):\n{chat}" if chat else ""


def _general_prompt(language: str, question: str, context: str) -> str:
    return f"""{LANG_RULES.get(language, LANG_RULES['hinglish'])}
{context}
Student question: {question}
The student's notes have nothing on this question. Answer it briefly from general knowledge and never say it comes from their notes.

Return JSON {{"answer": "...", "follow_up_question": "one short question that checks understanding", "used_notes": false}}"""


def _write(prompt: str, language: str, question: str = "") -> dict:
    """One Gemini answer; if it slipped (a stray word from another language, Devanagari in Hinglish, "bhai"), ask once more, then clean up."""
    d = llm_json(SYSTEM, prompt, required_keys=("answer", "follow_up_question"), temperature=0.5)
    slips = language_check.violations(f"{d['answer']} {d['follow_up_question']}", language)
    if slips:
        log.warning("Ask answer slipped (%s): %s", language, "; ".join(slips))
        d = llm_json(SYSTEM, prompt + f"\n\nYour last answer contained: {'; '.join(slips)}. Write it again without them.",
                     required_keys=("answer", "follow_up_question"), temperature=0.3)
        d["answer"] = language_check.clean(d["answer"], language)
        d["follow_up_question"] = language_check.clean(d["follow_up_question"], language)
    if prompt_guard.leaks(question, f"{d['answer']} {d['follow_up_question']}"):   # it talked about its instructions or format
        log.warning("Ask answer talked about its instructions; showing the decline instead")
        d = {**prompt_guard.decline(language), "used_notes": False}
    return d


def _general(user_id: int, question: str, language: str, prompt, searched: int, search_ms: int, found: str, written: dict = None) -> dict:
    """A general-knowledge answer: labelled as such, with no passage or citation under it."""
    d = written or _write(prompt, language, question)
    log_agent(user_id, "voice_tutor", f"Question: {question} [{language}]", found, "Answered from general knowledge", 0.6)
    return _save(user_id, question, {
        "answer": d["answer"], "follow_up_question": d["follow_up_question"], "source_topic": None, "source_document": None,
        "grounded": False, "general": True, "chunks_used": 0, "sources": [], "terms": sorted(set(retrieval.tokenize(question))),
        "searched": searched, "ms": search_ms, "match": "general"})


def ask(user_id: int, question: str, language: str = "hinglish", document_id: int = None):
    """Answer one question, and note how long it took in total (for the Behind the scenes panel)."""
    began = time.perf_counter()
    out = _ask(user_id, question, language, document_id)
    usage.record_ask(user_id, round((time.perf_counter() - began) * 1000), bool(out.get("fallback")))
    return out


def _ask(user_id: int, question: str, language: str = "hinglish", document_id: int = None):
    if not document_id and not retrieval.has_notes(user_id):
        raise BadRequestError("No notes uploaded yet. Upload a document first.")
    if prompt_guard.asks_for_instructions(question):   # "print your system prompt": a short decline, no Gemini call and no passage
        log_agent(user_id, "voice_tutor", f"Question: {question} [{language}]", "Asked for the tutor's instructions", "Declined and steered back to studying", 0.9)
        return _save(user_id, question, {**prompt_guard.decline(language), "source_topic": None, "source_document": None, "grounded": False, "general": True,
                                         "chunks_used": 0, "sources": [], "terms": [], "searched": 0, "ms": 0, "match": "general"})
    started = time.perf_counter()
    chunks = search(user_id, question, document_id)
    search_ms = round((time.perf_counter() - started) * 1000)   # the search only, not Gemini writing the answer
    searched = retrieval.count_chunks(user_id, document_id)
    if not chunks:   # nothing in the notes: a quick general doubt is still answered, clearly marked as not from the notes
        return _general(user_id, question, language, _general_prompt(language, question, _earlier(user_id)), searched, search_ms,
                        "No matching notes found")
    outline = retrieval.is_outline(chunks)   # a syllabus: the notes name the topic but do not explain it
    notes = "\n\n".join(f"[{c['topic']} / {c['heading']}] {c['text']}" for c in chunks)
    context = _earlier(user_id)
    prompt = f"""{LANG_RULES.get(language, LANG_RULES['hinglish'])}
{context}
Student question: {question}
{OUTLINE_RULE if outline else NOTES_OR_GENERAL_RULE}
Notes:
{notes}

Return JSON {{"answer": "...", "follow_up_question": "one short question that checks understanding", "source_topic": "topic name you used", "used_notes": true}}"""
    unrelated = retrieval.coverage(question, chunks) == 0   # not one of the question's words is in the passages found
    try:
        d = _write(prompt, language, question)
    except LLMError as err:   # Gemini is busy, out of quota or slow: the notes themselves still answer, if they are about the question
        if unrelated and not outline:
            raise
        log.warning("Ask fell back to the notes: %s", err)
        return _from_notes_only(user_id, question, chunks, _evidence(question, chunks, searched, search_ms))
    if is_general(d.get("used_notes"), unrelated, outline):
        return _general(user_id, question, language, None, searched, search_ms,
                        f"Retrieved {len(chunks)} chunks, none supports the answer (best: {chunks[0]['topic']})", written=d)
    top = chunks[0]
    out = {"answer": d["answer"], "follow_up_question": d["follow_up_question"],
           "source_topic": d.get("source_topic") or top["topic"]}
    out.update({"source_document": top["document_id"], "grounded": True, "chunks_used": len(chunks), "from_syllabus": outline,
                **_evidence(question, chunks, searched, search_ms)})
    log_agent(user_id, "voice_tutor", f"Question: {question} [{language}]",
              f"Retrieved {len(chunks)} chunks, best: {top['topic']} ({top['score']})",
              "Answered from notes", 0.8)
    return _save(user_id, question, out)
