"""Exam-date plan (GET/PUT /api/plan) and the concept map (GET /api/concept-map)."""
from datetime import date

from app import db
from app.domain.concept_map import build_links
from app.domain.planner import build_plan
from app.errors import BadRequestError
from app.services.progress_data import local_today, topics_with_progress


def get_plan(user_id: int):
    user = db.one("SELECT target_exam_date, daily_study_minutes FROM users WHERE id = ?", (user_id,))
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
    db.ensure_user(user_id)
    db.execute("UPDATE users SET target_exam_date = ?, daily_study_minutes = ? WHERE id = ?",
               (exam.isoformat(), minutes_per_day, user_id))
    return get_plan(user_id)


def clear_plan(user_id: int):
    db.execute("UPDATE users SET target_exam_date = NULL WHERE id = ?", (user_id,))
    return get_plan(user_id)


def concept_map(user_id: int):
    topics = topics_with_progress(user_id)
    chunks = db.query("SELECT c.topic_id, c.heading, c.text FROM chunks c JOIN documents d ON d.id = c.document_id "
                      "WHERE d.user_id = ?", (user_id,))
    links = build_links([{"id": t["topic_id"], "topic_name": t["topic_name"]} for t in topics], chunks)
    return {"nodes": [{"id": t["topic_id"], "topic": t["topic_name"], "document_id": t["document_id"],
                       "mastery": t["mastery"]} for t in topics],
            "links": links}
