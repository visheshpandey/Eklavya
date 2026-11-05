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
LIST_MIN_LINES = 3        # this many short lines are a list of items (a syllabus), not a title
ORPHANS_PER_CHUNK = 40
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
    used = True    # the current heading has text under it; one with nothing under it may be a syllabus item
    orphans = []

    def flush():
        nonlocal buf, buf_words
        if buf:
            chunks.append({"heading": heading, "text": " ".join(buf)})
        buf, buf_words = [], 0

    def new_heading(title):
        nonlocal heading, used
        flush()
        if not used and heading:
            orphans.append(heading)
        heading, used = title, False

    for p in pars:
        lines = [line.strip() for line in p.splitlines() if line.strip()]
        if len(lines) >= LIST_MIN_LINES and all(len(line.split()) <= MAX_HEADING_WORDS for line in lines):   # a list of short items: keep every one
            if SECTION_MARKER.match(lines[0]):
                new_heading(lines[0])
                lines = lines[1:]
            p = ", ".join(lines)
        else:
            p = " ".join(lines)
            if _is_heading(p):
                new_heading(p)
                continue
        used = True
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
    if not used and heading:
        orphans.append(heading)
    # short lines with nothing under them: one or two are titles, but several (or nothing else at all) are a list of topics, and every one counts
    if orphans and (not chunks or len(orphans) >= LIST_MIN_LINES):
        for start in range(0, len(orphans), ORPHANS_PER_CHUNK):
            chunks.append({"heading": "", "text": ", ".join(orphans[start:start + ORPHANS_PER_CHUNK])})
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


OUTLINE_SEGMENT_WORDS = 6   # a piece of text this long (between commas, dashes, full stops) explains something
OUTLINE_MIN_WORDS = 20      # fewer explaining words than this: nothing to teach from
OUTLINE_SHARE = 0.3         # or less than this share of the text explains anything: a list of topics


def is_outline(chunks) -> bool:
    """True when the passages only NAME topics (a syllabus, a list of units), so there is nothing to teach from (pure).

    A syllabus line such as "Unit 2: CPU Scheduling - FCFS, SJF, Round Robin" splits into short items; real notes have
    sentences. Only pieces of OUTLINE_SEGMENT_WORDS or more count as explanation.
    """
    explaining = total = 0
    for chunk in chunks or []:
        for piece in re.split(r"[.,;:!?\n()|•–—]|\s-\s", chunk.get("text", "")):
            n = len(piece.split())
            total += n
            if n >= OUTLINE_SEGMENT_WORDS:
                explaining += n
    return explaining < OUTLINE_MIN_WORDS or explaining < OUTLINE_SHARE * total


SOURCE_LIMIT = 3          # citations shown under an answer
SOURCE_RELATIVE = 0.5     # a passage must score at least this share of the best passage's score
SOURCE_MIN_COVERAGE = 0.2  # ... and share this much of the question's words, unless it is from the best passage's own topic


def relevant_sources(question: str, chunks, limit: int = SOURCE_LIMIT):
    """The passages worth citing (pure): best first, at most `limit`. A passage is dropped when its score is far below the best one's, or when it
    neither shares the question's topic nor enough of its words (a question about deadlocks must not cite a passage about database transactions)."""
    if not chunks:
        return []
    best = chunks[0]
    kept = []
    for chunk in sorted(chunks, key=lambda c: c.get("score", 0), reverse=True):
        close = chunk.get("score", 0) >= SOURCE_RELATIVE * best.get("score", 0)
        on_topic = chunk.get("topic") == best.get("topic") or coverage(question, [chunk]) >= SOURCE_MIN_COVERAGE
        if close and on_topic:
            kept.append(chunk)
    return kept[:limit]


# Words that tell Eklavya WHAT TO DO, not what the topic is ("Explain Precision in simple words"): notes never contain them,
# so counting them would make a question that names a topic exactly look like a weak match.
ASK_WORDS = frozenset("explain describe define tell words word meaning mean means about understand give show revise first".split())


def coverage(question: str, chunks) -> float:
    """Share (0 to 1) of the question's meaningful words that appear in the given passages: how well the notes answer it.
    A word and its plural or "-ing" form count as the same."""
    def stem(word: str) -> str:
        for ending in ("ing", "es", "s"):
            if len(word) > len(ending) + 2 and word.endswith(ending):
                return word[: -len(ending)]
        return word
    wanted = {stem(t) for t in tokenize(question) if t not in ASK_WORDS}
    if not wanted:
        return 0.0
    found = {stem(t) for c in chunks for t in tokenize(f"{c.get('heading') or ''} {c['text']}")}
    return len(wanted & found) / len(wanted)


def count_chunks(user_id: int, document_id: int = None) -> int:
    """How many passages the student's notes (or one document) are made of."""
    if document_id:
        return db.one("SELECT COUNT(*) AS n FROM chunks WHERE document_id = ?", (document_id,))["n"]
    return db.one("SELECT COUNT(*) AS n FROM chunks c JOIN documents d ON d.id = c.document_id WHERE d.user_id = ?", (user_id,))["n"]


def has_notes(user_id: int) -> bool:
    return db.one("SELECT 1 AS present FROM documents WHERE user_id = ? LIMIT 1", (user_id,)) is not None
