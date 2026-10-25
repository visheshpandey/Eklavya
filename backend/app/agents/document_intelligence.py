"""Document Intelligence agent: chunk uploaded text, extract topics, store everything."""
from app import db
from app.agents.logger import log_agent
from app.ai.gemini import llm_json
from app.domain import retrieval
from app.errors import BadRequestError, LLMError

SYSTEM = "You extract the topic structure of study notes. Respond with valid JSON only."


def _llm_topics(text: str):
    prompt = (
        'Return JSON {"topics": ["Topic 1", "Topic 2"]}: 3-8 short topic names (1-4 words each) '
        "covering the notes below, in the order they appear.\n\nNotes:\n" + text[:8000]
    )
    data = llm_json(SYSTEM, prompt, required_keys=("topics",), temperature=0.2)
    names = [str(t).strip() for t in data["topics"] if str(t).strip()] if isinstance(data["topics"], list) else []
    if not names:
        raise LLMError("Gemini returned no topics")
    return names[:8]


def _heading_topics(chunks):
    seen, names = set(), []
    for c in chunks:
        h = c["heading"].strip()
        if h and h.lower() not in seen:
            seen.add(h.lower())
            names.append(h)
    return names


def _assign_topic(chunk, topics):
    """topics: list[{id, topic_name}]. Heading match wins, otherwise token overlap."""
    heading = chunk["heading"].lower()
    for t in topics:
        if t["topic_name"].lower() == heading:
            return t["id"]
    ctoks = set(retrieval.tokenize(chunk["heading"] + " " + chunk["text"]))
    best, best_score = None, 0
    for t in topics:
        score = len(set(retrieval.tokenize(t["topic_name"])) & ctoks)
        if score > best_score:
            best, best_score = t["id"], score
    return best if best is not None else (topics[0]["id"] if topics else None)


def ingest_document(user_id: int, file_name: str, text: str, use_llm: bool = True):
    """Chunk + topics + initial mastery rows. Returns {document_id, status, topics_found}."""
    db.ensure_user(user_id)
    chunks = retrieval.chunk_text(text)
    if not chunks:
        raise BadRequestError("No readable text found in the document.")

    # Topics come from Gemini. use_llm=False is only for the seeded demo document, whose topics are
    # its own section titles (explicit seed data, not a fallback).
    names = _llm_topics(text) if use_llm else _heading_topics(chunks)
    source = "gemini" if use_llm else "seed headings"

    doc_id = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, ?)", (user_id, file_name))
    topics = []
    for n in names:
        tid = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, ?)", (doc_id, n))
        topics.append({"id": tid, "topic_name": n})
        db.execute("INSERT OR IGNORE INTO learner_mastery (user_id, topic_id) VALUES (?, ?)", (user_id, tid))
    for c in chunks:
        db.execute(
            "INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, ?, ?)",
            (doc_id, _assign_topic(c, topics), c["heading"], c["text"]),
        )

    log_agent(user_id, "document_intelligence",
              f"Uploaded {file_name}: {len(chunks)} chunks",
              f"Found {len(topics)} topics via {source}",
              "Stored chunks, topics and starting mastery (50)", 0.9)
    return {"document_id": doc_id, "status": "processed", "topics_found": topics}
