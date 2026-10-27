"""Flashcards agent: cards written by Gemini from a topic's notes, plus cards from the student's own mistakes."""
from app import db
from app.agents.logger import log_agent
from app.ai.gemini import extract_list, llm_json
from app.domain import retrieval
from app.errors import LLMError, NotFoundError

SYSTEM = "You write short, exam-useful flashcards from study notes. Respond with valid JSON only."
CARDS_PER_TOPIC = 6
MAX_SIDE = 300


def _clean(text) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= MAX_SIDE else text[: MAX_SIDE - 1].rstrip() + "…"


def generate(user_id: int, topic_id: int):
    """Replace the topic's note cards with fresh ones; add a card per mistake. Returns the topic's cards."""
    topic = db.one("SELECT id, document_id, topic_name FROM topics WHERE id = ?", (topic_id,))
    if not topic:
        raise NotFoundError("Unknown topic")
    passages = retrieval.retrieve(topic["document_id"], topic["topic_name"], k=4)
    context = "\n\n".join(p["text"] for p in passages)
    if not context:
        raise NotFoundError("Nothing in the notes for this topic yet.")
    prompt = (f'Write {CARDS_PER_TOPIC} flashcards about "{topic["topic_name"]}" using ONLY these notes. Return JSON '
              '{"cards": [{"front": "a short question or term", "back": "the answer in 1-2 sentences, with a formula or '
              'example if the notes have one"}]}. Mix definitions, formulas, worked numbers and "why" questions.\n\n'
              f"Notes:\n{context}")
    cards = [(c.get("front"), c.get("back")) for c in extract_list(llm_json(SYSTEM, prompt, temperature=0.4), "cards")
             if isinstance(c, dict)]
    cards = [(_clean(f), _clean(b)) for f, b in cards if _clean(f) and _clean(b)]
    if not cards:
        raise LLMError("Gemini did not return usable flashcards.")

    mistakes = mistake_cards(user_id, topic_id)
    with db.get_conn() as conn:
        conn.execute("DELETE FROM flashcards WHERE user_id = ? AND topic_id = ?", (user_id, topic_id))
        conn.executemany("INSERT INTO flashcards (user_id, topic_id, front, back, source) VALUES (?, ?, ?, ?, 'notes')",
                         [(user_id, topic_id, f, b) for f, b in cards])
        conn.executemany("INSERT INTO flashcards (user_id, topic_id, front, back, source) VALUES (?, ?, ?, ?, 'mistake')",
                         [(user_id, topic_id, front, back) for front, back in mistakes])
    log_agent(user_id, "flashcards", f"Cards requested for {topic['topic_name']}",
              f"{len(cards)} cards from notes, {len(mistakes)} from mistakes", "Saved the deck", 0.8)
    return cards_for(user_id, topic_id)


def mistake_cards(user_id: int, topic_id: int):
    """One card per question the student made a mistake on, even if a follow-up later corrected it (they still made it):
    the question in front; behind it the right answer, why, and the wrong belief that was detected."""
    rows = db.query(
        "SELECT q.id, q.question, q.options, q.correct, q.explanation, x.misconception_text "
        "FROM misconceptions x JOIN quiz_questions q ON q.id = x.question_id "
        "WHERE x.user_id = ? AND x.topic_id = ? ORDER BY x.id DESC", (user_id, topic_id))
    cards, seen = [], set()
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        options = db.loads(r["options"], [])
        right = next((o for o in options if o.strip().upper().startswith(r["correct"])), r["correct"])
        back = f"Answer: {right}. {r['explanation'] or ''}" + (f" Watch out: {r['misconception_text']}" if r["misconception_text"] else "")
        cards.append((_clean(r["question"]), _clean(back)))
    return cards


def cards_for(user_id: int, topic_id: int = None):
    sql = ("SELECT f.id, f.topic_id, t.topic_name AS topic, f.front, f.back, f.source FROM flashcards f "
           "JOIN topics t ON t.id = f.topic_id WHERE f.user_id = ?")
    args = [user_id]
    if topic_id:
        sql += " AND f.topic_id = ?"
        args.append(topic_id)
    return db.query(sql + " ORDER BY f.topic_id, f.source DESC, f.id", tuple(args))
