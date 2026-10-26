"""Document Intelligence agent: chunk uploaded text, extract topics, store everything."""
from app import db
from app.agents.logger import log_agent
from app.ai import embeddings
from app.ai.gemini import extract_list, llm_json
from app.config import settings
from app.domain import retrieval
from app.errors import BadRequestError, LLMError

SYSTEM = "You extract the topic structure of study notes. Respond with valid JSON only."


MAX_TOPICS = 30
TOPIC_TEXT_CHARS = 60_000   # about 15k tokens: enough for a whole syllabus booklet in one call


def _llm_topics(text: str):
    prompt = (
        f'Return JSON {{"topics": ["Topic 1", "Topic 2"]}}: 3-{MAX_TOPICS} study topics (1-6 words each) covering the notes '
        "below, in the order they appear. If the notes contain several subjects or courses, start each topic with a short "
        'subject name so topics are distinguishable (for example "DBMS: Normalization"). Skip administrative parts such as '
        "reference books or marks.\n\nNotes:\n" + text[:TOPIC_TEXT_CHARS]
    )
    data = llm_json(SYSTEM, prompt, temperature=0.2, timeout_ms=settings.gemini_long_timeout_ms)
    names = [str(t).strip() for t in extract_list(data, "topics") if str(t).strip()]
    if not names:
        raise LLMError("Gemini returned no topics")
    return list(dict.fromkeys(names))[:MAX_TOPICS]


def _heading_topics(chunks):
    seen, names = set(), []
    for c in chunks:
        h = c["heading"].strip()
        if h and h.lower() not in seen:
            seen.add(h.lower())
            names.append(h)
    return names


HEADING_WEIGHT = 3        # a topic word found in the chunk's heading counts this many times more than one in its body
MIN_ASSIGN_SCORE = 0.5    # a chunk is filed under a topic only if at least this share of the topic's words match it


def _topic_tokens(topics):
    """Per topic: {word: weight}. A word used by many topics ("data", "unit") says little, so it weighs less."""
    token_sets = {t["id"]: set(retrieval.tokenize(t["topic_name"])) for t in topics}
    topics_using = {}
    for tokens in token_sets.values():
        for token in tokens:
            topics_using[token] = topics_using.get(token, 0) + 1
    return {tid: {token: 1 / topics_using[token] for token in tokens} for tid, tokens in token_sets.items()}


def _assign_topic(chunk, topics, weights):
    """Pick the topic a chunk belongs to: exact heading match, else the best weighted word overlap.

    The score is the share of the topic's (weighted) words that appear in the chunk, with extra credit for words
    in the heading, so a long or generic topic name cannot win just by matching common words. Chunks that match no
    topic well stay unfiled (still searchable); a topic without a chunk shows its closest passages instead.
    """
    heading = chunk["heading"].lower()
    for t in topics:
        if t["topic_name"].lower() == heading:
            return t["id"]
    heading_tokens = set(retrieval.tokenize(chunk["heading"]))
    body_tokens = set(retrieval.tokenize(chunk["text"]))
    best, best_score = None, 0.0
    for t in topics:
        topic_weights = weights[t["id"]]
        total = sum(topic_weights.values())
        if not total:
            continue
        matched = sum(w * (HEADING_WEIGHT if tok in heading_tokens else 1) for tok, w in topic_weights.items()
                      if tok in heading_tokens or tok in body_tokens)
        score = matched / total
        if score > best_score:
            best, best_score = t["id"], score
    if best_score >= MIN_ASSIGN_SCORE:
        return best
    # a weak match (one shared word such as "hierarchy") is not enough; a single-topic document is the only exception
    return topics[0]["id"] if len(topics) == 1 else None


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
    weights = _topic_tokens(topics)
    stored = []
    for c in chunks:
        chunk_id = db.execute(
            "INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, ?, ?)",
            (doc_id, _assign_topic(c, topics, weights), c["heading"], c["text"]),
        )
        stored.append({"id": chunk_id, **c})
    embedded = embeddings.embed_chunks(stored)   # meaning search; 0 if Gemini embeddings failed (logged)

    log_agent(user_id, "document_intelligence",
              f"Uploaded {file_name}: {len(chunks)} chunks",
              f"Found {len(topics)} topics via {source}",
              "Stored chunks, topics and starting mastery (50)"
              + (f"; embedded {embedded} chunks for meaning search" if embedded else "; search by words only (embedding failed)"),
              0.9)
    return {"document_id": doc_id, "status": "processed", "topics_found": topics}
