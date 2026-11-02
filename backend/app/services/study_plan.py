"""Exam-date plan (GET/PUT /api/plan) and the concept map (GET /api/concept-map)."""
from datetime import date

from app import db
from app.domain.concept_map import build_links
from app.domain.planner import build_plan
from app.errors import BadRequestError
from app.services.progress_data import local_today, topics_with_progress


MAX_EXAM_DAYS = 1100   # about three years: anything further out is a typo (a six-digit year typed into a date field)


def usable_exam(text, today: date):
    """The exam date as a ``date`` when it is today or up to MAX_EXAM_DAYS ahead; None for no date, a bad one or an absurd one."""
    try:
        exam = date.fromisoformat(text) if text else None
    except ValueError:
        return None
    return exam if exam is not None and 0 <= (exam - today).days <= MAX_EXAM_DAYS else None


def _forget_unusable(user_id: int, user: dict):
    """A saved exam date that is absurdly far away (a typo) is cleared, so Today and the planner stop showing it.
    A date that has simply passed is kept: the planner already says so."""
    text = user.get("target_exam_date")
    if _is_iso(text) and (date.fromisoformat(text) - local_today()).days > MAX_EXAM_DAYS:
        db.execute("UPDATE users SET target_exam_date = NULL WHERE id = ?", (user_id,))
        user["target_exam_date"] = None


def _is_iso(text) -> bool:
    try:
        date.fromisoformat(text)
        return True
    except (TypeError, ValueError):
        return False


def get_plan(user_id: int):
    user = db.one("SELECT target_exam_date, daily_study_minutes FROM users WHERE id = ?", (user_id,))
    if user:
        user = dict(user)
        _forget_unusable(user_id, user)
    if not user or not user["target_exam_date"]:
        return {"exam_date": None, "minutes_per_day": (user or {}).get("daily_study_minutes") or 30, "plan": None}
    exam = date.fromisoformat(user["target_exam_date"])
    minutes = user["daily_study_minutes"] or 30
    topics = topics_with_progress(user_id)
    try:
        plan = build_plan(topics, local_today(), exam, minutes) if topics else None
    except ValueError:
        plan = None   # the saved exam date has passed
    return {"exam_date": exam.isoformat(), "minutes_per_day": minutes, "plan": plan}


def set_plan(user_id: int, exam_date: str, minutes_per_day: int):
    try:
        exam = date.fromisoformat(exam_date)
    except ValueError as exc:
        raise BadRequestError("Exam date must look like 2026-12-15.") from exc
    if exam <= local_today():
        raise BadRequestError("Pick an exam date after today.")
    if (exam - local_today()).days > MAX_EXAM_DAYS:
        raise BadRequestError("Pick an exam date within the next three years. Check the year you typed.")
    db.ensure_user(user_id)
    db.execute("UPDATE users SET target_exam_date = ?, daily_study_minutes = ? WHERE id = ?",
               (exam.isoformat(), minutes_per_day, user_id))
    return get_plan(user_id)


def clear_plan(user_id: int):
    db.execute("UPDATE users SET target_exam_date = NULL WHERE id = ?", (user_id,))
    return get_plan(user_id)


def concept_map(user_id: int):
    from app.domain import titles
    from app.services import mastery_log

    rows = db.query("SELECT t.id AS topic_id, t.topic_name, t.document_id, d.file_name AS document, m.mastery_score, m.last_updated "
                    "FROM topics t JOIN documents d ON d.id = t.document_id "
                    "LEFT JOIN learner_mastery m ON m.topic_id = t.id AND m.user_id = d.user_id WHERE d.user_id = ? ORDER BY d.id, t.id", (user_id,))
    for r in rows:
        r["mastery_score"] = 50.0 if r["mastery_score"] is None else r["mastery_score"]
    rows = mastery_log.faded_rows(user_id, rows, local_today())
    chunks = db.query("SELECT c.topic_id, c.heading, c.text FROM chunks c JOIN documents d ON d.id = c.document_id "
                      "WHERE d.user_id = ?", (user_id,))
    notes = {}
    for c in chunks:
        notes[c["topic_id"]] = notes.get(c["topic_id"], 0) + 1
    links = build_links([{"id": t["topic_id"], "topic_name": t["topic_name"]} for t in rows], chunks)
    return {"nodes": [{"id": t["topic_id"], "topic": t["topic_name"], "document_id": t["document_id"], "mastery": t["mastery_score"],
                       "started": t["started"], "notes": notes.get(t["topic_id"], 0),
                       "subject": titles.subject_of(t["topic_name"], t["document"])} for t in rows],
            "links": links}
