"""Challenge a friend: a short quiz on one topic, shared by a code. Everyone plays the same questions once.

The questions are copied into the challenge, so a friend needs no notes of their own and the answers stay on the server.
These are for fun and do not change mastery. The best score wins; a tie goes to the faster player.
"""
import json
import random
import secrets

from app import db
from app.agents import quiz
from app.config import settings
from app.errors import BadRequestError, NotFoundError
from app.services.groups import CODE_LENGTH, CODE_LETTERS, display_name

QUESTIONS = 5


def _account(user_id: int) -> None:
    if db.is_guest(user_id):
        raise BadRequestError("Challenges need your own account. Sign in or create one first.")


def _code() -> str:
    while True:
        code = "".join(secrets.choice(CODE_LETTERS) for _ in range(CODE_LENGTH))
        if not db.one("SELECT id FROM challenges WHERE code = ?", (code,)):
            return code


def _find(code: str) -> dict:
    row = db.one("SELECT * FROM challenges WHERE code = ?", ("".join(code.split()).upper(),))
    if not row:
        raise NotFoundError("No challenge has that code. Check it with your friend.")
    return row


def create(user_id: int, topic_id: int) -> dict:
    _account(user_id)
    topic = db.one("SELECT t.id, t.topic_name FROM topics t JOIN documents d ON d.id = t.document_id "
                   "WHERE t.id = ? AND d.user_id = ?", (topic_id, user_id))
    if not topic:
        raise NotFoundError("Unknown topic")
    quiz.warm_up(topic_id, QUESTIONS)
    rows = db.query("SELECT question, options, correct FROM quiz_questions WHERE topic_id = ?", (topic_id,))
    if len(rows) < 3:
        raise BadRequestError("Could not write enough questions for this topic right now. Try again in a minute.")
    picked = random.sample(rows, min(QUESTIONS, len(rows)))
    questions = [{"question": r["question"], "options": db.loads(r["options"], []), "correct": r["correct"]} for r in picked]
    db.execute("INSERT INTO challenges (code, user_id, topic, questions) VALUES (?, ?, ?, ?)",
               (_code(), user_id, topic["topic_name"], json.dumps(questions)))
    return detail(user_id, db.one("SELECT code FROM challenges WHERE user_id = ? ORDER BY id DESC", (user_id,))["code"])


def open_challenge(user_id: int, code: str) -> dict:
    """What a player sees before playing: the questions without answers, and whether they already played."""
    row = _find(code)
    played = db.one("SELECT id FROM challenge_attempts WHERE challenge_id = ? AND user_id = ?", (row["id"], user_id))
    questions = json.loads(row["questions"])
    return {"code": row["code"], "topic": row["topic"], "played": bool(played), "total": len(questions),
            "questions": [{"position": i + 1, "question": q["question"], "options": q["options"]} for i, q in enumerate(questions)]}


def play(user_id: int, code: str, answers: dict, seconds: int) -> dict:
    _account(user_id)
    row = _find(code)
    if db.one("SELECT id FROM challenge_attempts WHERE challenge_id = ? AND user_id = ?", (row["id"], user_id)):
        return detail(user_id, code)   # one try each: a second submit just shows the result
    chosen = {int(k): str(v).strip().upper()[:1] for k, v in (answers or {}).items()}
    questions = json.loads(row["questions"])
    correct = sum(chosen.get(i + 1) == q["correct"] for i, q in enumerate(questions))
    db.execute("INSERT INTO challenge_attempts (challenge_id, user_id, correct, total, seconds) VALUES (?, ?, ?, ?, ?)",
               (row["id"], user_id, correct, len(questions), min(max(int(seconds), 0), 3600)))
    return detail(user_id, code)


def _standings(challenge_id: int, me: int) -> list:
    rows = db.query("SELECT a.user_id, a.correct, a.total, a.seconds, u.name, u.email FROM challenge_attempts a "
                    "JOIN users u ON u.id = a.user_id WHERE a.challenge_id = ?", (challenge_id,))
    rows.sort(key=lambda r: (-r["correct"], r["seconds"], r["user_id"]))
    return [{"rank": i + 1, "name": display_name(r), "you": r["user_id"] == me, "correct": r["correct"], "total": r["total"],
             "seconds": r["seconds"]} for i, r in enumerate(rows)]


def detail(user_id: int, code: str) -> dict:
    row = _find(code)
    played = bool(db.one("SELECT id FROM challenge_attempts WHERE challenge_id = ? AND user_id = ?", (row["id"], user_id)))
    out = {"code": row["code"], "topic": row["topic"], "mine": row["user_id"] == user_id, "played": played,
           "total": len(json.loads(row["questions"])), "standings": _standings(row["id"], user_id) if played else []}
    if played:   # answers are shown only after you have played
        out["review"] = [{"position": i + 1, "question": q["question"], "options": q["options"], "correct": q["correct"]}
                         for i, q in enumerate(json.loads(row["questions"]))]
    return out


def mine(user_id: int) -> list:
    rows = db.query("SELECT c.code, c.topic, c.created_at, (SELECT COUNT(*) FROM challenge_attempts a WHERE a.challenge_id = c.id) AS players "
                    "FROM challenges c WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 20", (user_id,))
    return rows


def wins(user_id: int) -> int:
    """Challenges where this student played and finished first among at least two players."""
    count = 0
    for row in db.query("SELECT DISTINCT challenge_id FROM challenge_attempts WHERE user_id = ?", (user_id,)):
        board = db.query("SELECT user_id, correct, seconds FROM challenge_attempts WHERE challenge_id = ?", (row["challenge_id"],))
        if len(board) >= 2:
            board.sort(key=lambda r: (-r["correct"], r["seconds"], r["user_id"]))
            count += board[0]["user_id"] == user_id
    return count


def erase(user_id: int) -> None:
    """Account deletion: their challenges (with everyone's attempts at them) and their own attempts."""
    with db.get_conn() as conn:
        conn.execute("DELETE FROM challenge_attempts WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)", (user_id,))
        conn.execute("DELETE FROM challenges WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM challenge_attempts WHERE user_id = ?", (user_id,))
