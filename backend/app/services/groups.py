"""Study groups: friends join with a short code, share notes with each other and see a weekly leaderboard.

Shared notes are copied into the friend's own library (topics, passages, search vectors and questions), so each
student keeps their own progress and the original owner can remove theirs without breaking anyone else's.
Groups need a real account; the shared demo student cannot join one.
"""
import secrets
from datetime import datetime, timedelta, timezone

from app import db
from app.config import settings
from app.domain.streak import study_streak
from app.errors import BadRequestError, NotFoundError
from app.services.progress_data import active_days, local_today

CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O or 1/I, so a code read aloud is not mistyped
CODE_LENGTH = 6
MAX_MEMBERS = 50
MAX_GROUPS = 10
POINTS = {"correct": 10, "answer": 2, "card": 1, "session": 5}   # weekly leaderboard


def _account(user_id: int) -> None:
    if db.is_guest(user_id):
        raise BadRequestError("Study groups need your own account. Sign in or create one first.")


def display_name(row: dict) -> str:
    """What friends see: the name, else the part of the email before @ (the full email stays private)."""
    return (row.get("name") or "").strip() or (row.get("email") or "student").split("@")[0]


def _member(user_id: int, group_id: int) -> dict:
    group = db.one("SELECT g.* FROM study_groups g JOIN group_members m ON m.group_id = g.id WHERE g.id = ? AND m.user_id = ?",
                   (group_id, user_id))
    if not group:
        raise NotFoundError("You are not in this group")
    return group


def _new_code() -> str:
    while True:
        code = "".join(secrets.choice(CODE_LETTERS) for _ in range(CODE_LENGTH))
        if not db.one("SELECT id FROM study_groups WHERE code = ?", (code,)):
            return code


def my_groups(user_id: int) -> list:
    rows = db.query("SELECT g.id, g.name, g.code, g.owner_id, (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members "
                    "FROM study_groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY g.id", (user_id,))
    return [{"id": r["id"], "name": r["name"], "code": r["code"], "members": r["members"], "owner": r["owner_id"] == user_id}
            for r in rows]


def create(user_id: int, name: str) -> dict:
    _account(user_id)
    name = " ".join(name.split())[:60]
    if not name:
        raise BadRequestError("Give the group a name.")
    if len(my_groups(user_id)) >= MAX_GROUPS:
        raise BadRequestError(f"You can be in up to {MAX_GROUPS} groups.")
    group_id = db.execute("INSERT INTO study_groups (name, code, owner_id) VALUES (?, ?, ?)", (name, _new_code(), user_id))
    db.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (group_id, user_id))
    return detail(user_id, group_id)


def join(user_id: int, code: str) -> dict:
    _account(user_id)
    group = db.one("SELECT * FROM study_groups WHERE code = ?", ("".join(code.split()).upper(),))
    if not group:
        raise NotFoundError("No group has that code. Check it with your friend.")
    if db.one("SELECT id FROM group_members WHERE group_id = ? AND user_id = ?", (group["id"], user_id)):
        return detail(user_id, group["id"])
    if db.one("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?", (group["id"],))["n"] >= MAX_MEMBERS:
        raise BadRequestError("This group is full.")
    if len(my_groups(user_id)) >= MAX_GROUPS:
        raise BadRequestError(f"You can be in up to {MAX_GROUPS} groups.")
    db.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (group["id"], user_id))
    return detail(user_id, group["id"])


def leave(user_id: int, group_id: int) -> dict:
    """Leave a group. Its notes you shared stop being shared; the last one out removes the group."""
    group = _member(user_id, group_id)
    with db.get_conn() as conn:
        conn.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", (group_id, user_id))
        conn.execute("DELETE FROM group_documents WHERE group_id = ? AND shared_by = ?", (group_id, user_id))
        left = conn.execute("SELECT user_id FROM group_members WHERE group_id = ? ORDER BY id", (group_id,)).fetchall()
        if not left:
            conn.execute("DELETE FROM group_documents WHERE group_id = ?", (group_id,))
            conn.execute("DELETE FROM study_groups WHERE id = ?", (group_id,))
        elif group["owner_id"] == user_id:   # the longest-standing member looks after the group now
            conn.execute("UPDATE study_groups SET owner_id = ? WHERE id = ?", (left[0]["user_id"], group_id))
    return {"left": group_id, "groups": my_groups(user_id)}


def leave_all(user_id: int) -> None:
    """Account deletion: leave every group (see accounts.erase_user)."""
    for group in my_groups(user_id):
        leave(user_id, group["id"])


def _week_start() -> str:
    """Seven days ago, in the stored UTC text format, for the weekly points."""
    return (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")


def points(user_id: int, since: str) -> dict:
    answers = db.one("SELECT COUNT(*) AS n, SUM(is_correct) AS ok FROM quiz_attempts WHERE user_id = ? AND answered_at >= ?",
                     (user_id, since))
    cards = db.one("SELECT COUNT(*) AS n FROM flashcards WHERE user_id = ? AND reviewed_at >= ?", (user_id, since))["n"]
    sessions = db.one("SELECT COUNT(*) AS n FROM voice_sessions WHERE user_id = ? AND turns > 0 AND started_at >= ?",
                      (user_id, since))["n"]
    correct = answers["ok"] or 0
    total = (correct * POINTS["correct"] + ((answers["n"] or 0) - correct) * POINTS["answer"]
             + cards * POINTS["card"] + sessions * POINTS["session"])
    return {"points": total, "correct": correct, "answers": answers["n"] or 0, "cards": cards, "sessions": sessions}


def leaderboard(group_id: int, user_id: int) -> list:
    since = _week_start()
    today = local_today()
    rows = db.query("SELECT u.id, u.name, u.email FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?",
                    (group_id,))
    board = []
    for row in rows:
        mastery = db.one("SELECT AVG(m.mastery_score) AS a FROM learner_mastery m JOIN topics t ON t.id = m.topic_id "
                         "WHERE m.user_id = ?", (row["id"],))["a"]
        board.append({"name": display_name(row), "you": row["id"] == user_id, **points(row["id"], since),
                      "streak": study_streak(active_days(row["id"]), today), "mastery": round(mastery or 0)})
    board.sort(key=lambda r: (-r["points"], -r["streak"], r["name"].lower()))
    for rank, row in enumerate(board, start=1):
        row["rank"] = rank
    return board


def detail(user_id: int, group_id: int) -> dict:
    group = _member(user_id, group_id)
    shared = db.query(
        "SELECT gd.document_id, gd.shared_by, gd.shared_at, d.file_name, u.name, u.email, "
        "(SELECT COUNT(*) FROM topics t WHERE t.document_id = d.id) AS topics "
        "FROM group_documents gd JOIN documents d ON d.id = gd.document_id JOIN users u ON u.id = gd.shared_by "
        "WHERE gd.group_id = ? ORDER BY gd.id DESC", (group_id,))
    copied = {r["copied_from"] for r in db.query("SELECT copied_from FROM documents WHERE user_id = ? AND copied_from IS NOT NULL",
                                                  (user_id,))}
    notes = [{"document_id": r["document_id"], "file_name": r["file_name"], "topics": r["topics"], "shared_by": display_name(r),
              "mine": r["shared_by"] == user_id, "added": r["document_id"] in copied, "shared_at": r["shared_at"]} for r in shared]
    return {"id": group["id"], "name": group["name"], "code": group["code"], "owner": group["owner_id"] == user_id,
            "leaderboard": leaderboard(group_id, user_id), "notes": notes, "points": POINTS}


def share(user_id: int, group_id: int, document_id: int) -> dict:
    _member(user_id, group_id)
    if not db.one("SELECT id FROM documents WHERE id = ? AND user_id = ?", (document_id, user_id)):
        raise NotFoundError("Unknown document")
    db.execute("INSERT OR IGNORE INTO group_documents (group_id, document_id, shared_by) VALUES (?, ?, ?)",
               (group_id, document_id, user_id))
    return detail(user_id, group_id)


def unshare(user_id: int, group_id: int, document_id: int) -> dict:
    group = _member(user_id, group_id)
    row = db.one("SELECT shared_by FROM group_documents WHERE group_id = ? AND document_id = ?", (group_id, document_id))
    if not row:
        raise NotFoundError("Those notes are not shared in this group")
    if row["shared_by"] != user_id and group["owner_id"] != user_id:
        raise BadRequestError("Only the person who shared these notes, or the group owner, can remove them.")
    db.execute("DELETE FROM group_documents WHERE group_id = ? AND document_id = ?", (group_id, document_id))
    return detail(user_id, group_id)


def copy_notes(user_id: int, group_id: int, document_id: int) -> dict:
    """Add a friend's shared notes to my library. Questions come along, so practising them needs no new Gemini call."""
    _member(user_id, group_id)
    source = db.one("SELECT d.* FROM documents d JOIN group_documents gd ON gd.document_id = d.id "
                    "WHERE gd.group_id = ? AND d.id = ?", (group_id, document_id))
    if not source:
        raise NotFoundError("Those notes are not shared in this group")
    if source["user_id"] == user_id:
        raise BadRequestError("These are already your notes.")
    existing = db.one("SELECT id FROM documents WHERE user_id = ? AND copied_from = ?", (user_id, document_id))
    if existing:
        return {"document_id": existing["id"], "already": True}
    new_doc = db.execute("INSERT INTO documents (user_id, file_name, processed_status, copied_from) VALUES (?, ?, ?, ?)",
                         (user_id, source["file_name"], source["processed_status"], document_id))
    topic_map = {}
    for topic in db.query("SELECT * FROM topics WHERE document_id = ? ORDER BY id", (document_id,)):
        topic_map[topic["id"]] = db.execute("INSERT INTO topics (document_id, topic_name, parent_topic_id) VALUES (?, ?, ?)",
                                            (new_doc, topic["topic_name"], None))
    for chunk in db.query("SELECT c.*, e.vector FROM chunks c LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id "
                          "WHERE c.document_id = ? ORDER BY c.id", (document_id,)):
        chunk_id = db.execute("INSERT INTO chunks (document_id, topic_id, heading, text, page) VALUES (?, ?, ?, ?, ?)",
                              (new_doc, topic_map.get(chunk["topic_id"]), chunk["heading"], chunk["text"], chunk["page"]))
        if chunk["vector"]:
            db.execute("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, vector) VALUES (?, ?)", (chunk_id, chunk["vector"]))
    for old_id, new_id in topic_map.items():
        for q in db.query("SELECT * FROM quiz_questions WHERE topic_id = ?", (old_id,)):
            db.execute("INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions, difficulty) "
                       "VALUES (?, ?, ?, ?, ?, ?, ?)", (new_id, q["question"], q["options"], q["correct"], q["explanation"],
                                                       q["misconceptions"], q["difficulty"]))
    return {"document_id": new_doc, "topics": len(topic_map), "already": False}
