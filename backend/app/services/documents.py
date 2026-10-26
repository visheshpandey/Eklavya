"""Removing a notes document together with the progress that belongs to its topics."""
from app import db
from app.errors import NotFoundError

# tables that hold per-student progress keyed by topic
_PROGRESS_TABLES = ("quiz_attempts", "misconceptions", "study_missions", "learner_mastery", "learner_state",
                    "flashcards", "vivas", "debates")


def delete_document(user_id: int, document_id: int) -> None:
    """Delete the document, its chunks/topics/questions and the student's progress on those topics."""
    if not db.one("SELECT id FROM documents WHERE id = ? AND user_id = ?", (document_id, user_id)):
        raise NotFoundError("Unknown document")
    with db.get_conn() as conn:
        topic_ids = [row[0] for row in conn.execute("SELECT id FROM topics WHERE document_id = ?", (document_id,))]
        if topic_ids:
            marks = ",".join("?" * len(topic_ids))
            # rows that belong to a viva or debate on these topics go first, while the parent rows still exist
            conn.execute(f"DELETE FROM viva_answers WHERE viva_id IN (SELECT id FROM vivas WHERE user_id = ? AND topic_id IN ({marks}))",
                         (user_id, *topic_ids))
            conn.execute(f"DELETE FROM debate_rounds WHERE debate_id IN (SELECT id FROM debates WHERE user_id = ? AND topic_id IN ({marks}))",
                         (user_id, *topic_ids))
            for table in _PROGRESS_TABLES:
                conn.execute(f"DELETE FROM {table} WHERE user_id = ? AND topic_id IN ({marks})", (user_id, *topic_ids))
            conn.execute(f"DELETE FROM quiz_questions WHERE topic_id IN ({marks})", topic_ids)
        conn.execute("DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)", (document_id,))
        conn.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
        conn.execute("DELETE FROM topics WHERE document_id = ?", (document_id,))
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
