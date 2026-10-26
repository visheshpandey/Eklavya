"""Chunk notes and return top-k chunks for a question.

Ranking is BM25 word matching, blended with embedding similarity when vectors are given (the vectors come
from ``app.ai.embeddings`` via ``app.services.search``; this module stays pure).
"""
import math
import re
from collections import Counter

from app import db

RETRIEVAL_TOP_K = 4

# English + common Hinglish filler words that carry no topical meaning
STOPWORDS = set("""
a an the is are was were be of to in on for and or with by as at it this that these those from
what why how when which who does do did can could should would will your you i me my we
mujhe mujhko muje aur ya se ko ka ki ke hai hain tha the kya kyun kaise kaun kab nahi nahin
samjhao samjha batao bata do dena kar karo karna simple example ek ye yeh wo woh me mein par pe
""".split())

TARGET_WORDS = 200        # merge short paragraphs up to about this many words
MAX_CHUNK_WORDS = 260     # a single paragraph longer than this is split further
MAX_HEADING_WORDS = 8
# "Unit-I", "UNIT 3", "Module 2", "Chapter IV", "Course Objectives": where a long block of notes naturally splits
SECTION_MARKER = re.compile(r"\b(?:(?:unit|module|chapter|lesson)\b[\s\-\u2013.:]*(?:[ivx]{1,5}|\d{1,2})\b|course objectives?)", re.I)


def tokenize(text: str):
    return [t for t in re.findall(r"\w+", text.lower()) if t not in STOPWORDS and len(t) > 1]


def _is_heading(par: str) -> bool:
    words = par.split()
    return 0 < len(words) <= MAX_HEADING_WORDS and "\n" not in par and not par.rstrip().endswith((".", "?", "!", ":"))


def _split_sentences(text: str):
    """Pieces of at most ~TARGET_WORDS words, cut at sentence ends (or by words if there are none)."""
    if len(text.split()) <= MAX_CHUNK_WORDS:
        return [text]
    pieces, buf, count = [], [], 0
    for sentence in re.split(r"(?<=[.;])\s+", text):
        words = sentence.split()
        if len(words) > MAX_CHUNK_WORDS:                       # no punctuation at all: cut by words
            if buf:
                pieces.append(" ".join(buf)); buf, count = [], 0
            pieces += [" ".join(words[i:i + TARGET_WORDS]) for i in range(0, len(words), TARGET_WORDS)]
            continue
        if buf and count + len(words) > TARGET_WORDS:
            pieces.append(" ".join(buf)); buf, count = [], 0
        buf.append(sentence)
        count += len(words)
    if buf:
        pieces.append(" ".join(buf))
    return pieces


def _split_long_paragraph(paragraph: str):
    """A long block with no blank lines (typical of PDFs): cut at unit/module markers, then at sentences.
    Returns [(heading, text)]; the heading is the marker's title, e.g. "Unit-II Types of Finite Automata"."""
    cuts = sorted({0, *(m.start() for m in SECTION_MARKER.finditer(paragraph))})
    out = []
    for start, end in zip(cuts, cuts[1:] + [len(paragraph)]):
        segment = paragraph[start:end].strip()
        if not segment:
            continue
        heading = " ".join(re.split(r"[:.]", segment, maxsplit=1)[0].split()[:10]) if SECTION_MARKER.match(segment) else ""
        out += [(heading, piece) for piece in _split_sentences(segment)]
    return out


def chunk_text(text: str):
    """Chunks of about TARGET_WORDS words: [{heading, text}].

    * A short title-like paragraph becomes the heading of the paragraphs that follow it.
    * Short paragraphs are merged; a very long block (no blank lines, e.g. a PDF syllabus) is split at
      "Unit-I / Module 2" style markers and then at sentence ends, so every part is searchable on its own.
    """
    pars = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, heading, buf, buf_words = [], "", [], 0

    def flush():
        nonlocal buf, buf_words
        if buf:
            chunks.append({"heading": heading, "text": " ".join(buf)})
        buf, buf_words = [], 0

    for p in pars:
        p = re.sub(r"\s*\n\s*", " ", p)
        if _is_heading(p):
            flush()
            heading = p
            continue
        n = len(p.split())
        if n > MAX_CHUNK_WORDS:
            flush()
            chunks += [{"heading": h or heading, "text": piece} for h, piece in _split_long_paragraph(p)]
            continue
        if buf and buf_words + n > TARGET_WORDS:
            flush()
        buf.append(p)
        buf_words += n
    flush()
    return chunks


def bm25_rank(query: str, docs, k1: float = 1.5, b: float = 0.75):
    """docs: list of strings. Returns a score per doc."""
    q_terms = tokenize(query)
    toks = [tokenize(d) for d in docs]
    if not q_terms or not toks:
        return [0.0] * len(docs)
    avg = (sum(len(t) for t in toks) / len(toks)) or 1
    n = len(docs)
    df = Counter(term for t in toks for term in set(t))
    scores = []
    for t in toks:
        tf = Counter(t)
        s = 0.0
        for term in q_terms:
            if term not in tf:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            s += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * len(t) / avg))
        scores.append(s)
    return scores


_CHUNKS_SQL = (
    "SELECT c.id, c.text, c.heading, c.page, c.topic_id, c.document_id, t.topic_name AS topic, d.file_name AS document "
    "FROM chunks c JOIN documents d ON d.id = c.document_id LEFT JOIN topics t ON t.id = c.topic_id "
)


SEMANTIC_WEIGHT = 0.5     # share of the final score that comes from embedding similarity
MIN_SIMILARITY = 0.68     # measured on gemini-embedding-001: related questions score >= 0.70, unrelated ones <= 0.64


def cosine(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def blend(word_scores, similarities):
    """Word scores scaled to 0-1, mixed with meaning similarity (0 below MIN_SIMILARITY). Pure."""
    top = max(word_scores) if word_scores else 0
    out = []
    for word, sim in zip(word_scores, similarities):
        meaning = 0.0 if sim is None or sim < MIN_SIMILARITY else (sim - MIN_SIMILARITY) / (1 - MIN_SIMILARITY)
        out.append((1 - SEMANTIC_WEIGHT) * (word / top if top else 0) + SEMANTIC_WEIGHT * meaning)
    return out


def rank(rows, query: str, k: int, query_vector=None, vectors=None):
    """Best-first chunks for ``query``; empty when nothing matches.

    With ``query_vector`` and ``vectors`` ({chunk_id: vector}) the score also counts meaning, so "kitne spam
    pakde" can find the recall passage even without the word "recall".
    """
    if not rows:
        return []
    # the heading is searched too so "precision" finds the Precision section
    scores = bm25_rank(query, [(r["heading"] or "") + " " + r["text"] for r in rows])
    if query_vector is not None and vectors:
        scores = blend(scores, [cosine(query_vector, vectors[r["id"]]) if vectors.get(r["id"]) else None for r in rows])
    ranked = sorted(zip(scores, rows), key=lambda pair: pair[0], reverse=True)
    return [
        {"text": r["text"], "topic": r["topic"], "topic_id": r["topic_id"], "heading": r["heading"], "page": r["page"],
         "document": r["document"], "document_id": r["document_id"], "score": round(score, 3)}
        for score, r in ranked[:k] if score > 0
    ]


def chunks_of_document(document_id: int):
    return db.query(_CHUNKS_SQL + "WHERE c.document_id = ?", (document_id,))


def chunks_of_user(user_id: int):
    return db.query(_CHUNKS_SQL + "WHERE d.user_id = ?", (user_id,))


def retrieve(document_id: int, query: str, k: int = RETRIEVAL_TOP_K, query_vector=None, vectors=None):
    """Top-k chunks of ONE document: list of {text, topic, topic_id, heading, page, document, document_id, score}."""
    return rank(chunks_of_document(document_id), query, k, query_vector, vectors)


def retrieve_for_user(user_id: int, query: str, k: int = RETRIEVAL_TOP_K, query_vector=None, vectors=None):
    """Top-k chunks across ALL of the student's notes (used when no topic is in focus)."""
    return rank(chunks_of_user(user_id), query, k, query_vector, vectors)


def has_notes(user_id: int) -> bool:
    return db.one("SELECT 1 AS present FROM documents WHERE user_id = ? LIMIT 1", (user_id,)) is not None
