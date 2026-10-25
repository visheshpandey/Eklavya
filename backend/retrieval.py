"""Chunk notes and return top-k chunks for a question (BM25 over chunks in SQLite).

P1 upgrade path: swap `retrieve` scoring for embeddings; callers don't change.
"""
import math
import re
from collections import Counter

import db
from config import RETRIEVAL_TOP_K

# English + common Hinglish filler words that carry no topical meaning
STOPWORDS = set("""
a an the is are was were be of to in on for and or with by as at it this that these those from
what why how when which who does do did can could should would will your you i me my we
mujhe mujhko muje aur ya se ko ka ki ke hai hain tha the kya kyun kaise kaun kab nahi nahin
samjhao samjha batao bata do dena kar karo karna simple example ek ye yeh wo woh me mein par pe
""".split())

TARGET_WORDS = 200   # merge short paragraphs up to about this many words
MAX_HEADING_WORDS = 8


def tokenize(text: str):
    return [t for t in re.findall(r"\w+", text.lower()) if t not in STOPWORDS and len(t) > 1]


def _is_heading(par: str) -> bool:
    words = par.split()
    return 0 < len(words) <= MAX_HEADING_WORDS and "\n" not in par and not par.rstrip().endswith((".", "?", "!", ":"))


def chunk_text(text: str):
    """Paragraph-based chunks: [{heading, text}]. A short title-like paragraph becomes
    the heading of the paragraphs that follow it."""
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


def retrieve(document_id: int, query: str, k: int = RETRIEVAL_TOP_K):
    """Contract used by P3's search_notes tool:
    -> list[{text, topic, topic_id, heading, page, score}] best first, empty if nothing matches."""
    rows = db.query(
        "SELECT c.id, c.text, c.heading, c.page, c.topic_id, t.topic_name AS topic "
        "FROM chunks c LEFT JOIN topics t ON t.id = c.topic_id WHERE c.document_id = ?",
        (document_id,),
    )
    if not rows:
        return []
    # heading is searched too so "precision" finds the Precision section
    scores = bm25_rank(query, [(r["heading"] or "") + " " + r["text"] for r in rows])
    ranked = sorted(zip(scores, rows), key=lambda x: x[0], reverse=True)
    return [
        {"text": r["text"], "topic": r["topic"], "topic_id": r["topic_id"],
         "heading": r["heading"], "page": r["page"], "score": round(s, 3)}
        for s, r in ranked[:k] if s > 0
    ]


def latest_document_id(user_id: int):
    row = db.one("SELECT id FROM documents WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,))
    return row["id"] if row else None
