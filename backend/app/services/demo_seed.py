"""One-click demo data, loaded from demo/demo.json by ONE function (seed_demo): three notes documents with real titles (Operating Systems, DBMS,
Machine Learning), varied mastery with a week of history, a 4-day streak, flashcards (some due) and curated questions with per-option
misconceptions, so the demo quiz and diagnosis work even if the LLM is down. It only ever touches the demo student, never a real account.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app import db
from app.agents.document_intelligence import ingest_document
from app.agents.logger import log_agent
from app.config import settings
from app.agents.flashcards import BOX_DAYS
from app.errors import ForbiddenError, NotFoundError
from app.services import mastery_log
from app.services.documents import delete_document

NOTES_FILE = "ml_notes.txt"   # lives in settings.samples_dir

START_MASTERY = {"Classification in Machine Learning": 70, "Confusion Matrix": 65,
                 "Precision": 38, "Recall": 42, "F1 Score": 55}

M = lambda label, text: {"label": label, "text": text}  # noqa: E731

QUESTIONS = {
    "Precision": [
        {"question": "A spam filter marks 10 emails as spam and 8 of them really are spam. In total 20 spam emails exist. What is its precision?",
         "options": ["A. 40%", "B. 80%", "C. 20%", "D. 60%"], "correct": "B",
         "explanation": "Precision = TP / (TP + FP) = 8 / 10 = 80%. It only looks at the emails the model flagged.",
         "misconceptions": {
             "A": M("definition_mixup", "Confuses precision with recall: divides by all real spam emails (20) instead of by the emails the model flagged as spam (10)."),
             "C": M("calculation_error", "Divides by the wrong total and ignores which emails were flagged as spam.")}},
        {"question": "Which confusion-matrix cell is an email the model called spam that was actually fine?",
         "options": ["A. True Positive", "B. False Positive", "C. False Negative", "D. True Negative"], "correct": "B",
         "explanation": "The model predicted positive (spam) but the real condition is negative (fine) - a False Positive.",
         "misconceptions": {
             "C": M("condition_vs_prediction", "Mixes up the real-world condition with the model's prediction, so a wrongly flagged email is read as a missed one."),
             "A": M("condition_vs_prediction", "Looks only at the model's prediction (spam) and ignores that the real condition was not spam.")}},
        {"question": "Which formula gives precision?",
         "options": ["A. TP / (TP + FN)", "B. TP / (TP + FP)", "C. TP / (TP + TN)", "D. (TP + TN) / all"], "correct": "B",
         "explanation": "Precision = TP / (TP + FP): of everything predicted positive, how much was truly positive.",
         "misconceptions": {
             "A": M("formula_inversion", "Uses the recall formula (TP / (TP + FN)) for precision."),
             "D": M("definition_mixup", "Gives the accuracy formula instead of precision.")}},
    ],
    "Recall": [
        {"question": "20 spam emails exist and the filter catches 8 of them. What is its recall?",
         "options": ["A. 40%", "B. 80%", "C. 20%", "D. 8%"], "correct": "A",
         "explanation": "Recall = TP / (TP + FN) = 8 / 20 = 40%. It looks at all the real spam emails.",
         "misconceptions": {
             "B": M("definition_mixup", "Confuses recall with precision: divides by the emails flagged as spam instead of by all real spam.")}},
        {"question": "When does recall matter most?",
         "options": ["A. When false alarms are costly", "B. When missing a positive case is costly", "C. When classes are perfectly balanced", "D. Never"], "correct": "B",
         "explanation": "High recall means few missed cases, which matters in things like disease screening.",
         "misconceptions": {
             "A": M("definition_mixup", "Describes the case for high precision (few false alarms) instead of recall.")}},
    ],
    "Confusion Matrix": [
        {"question": "What does a True Negative mean?",
         "options": ["A. Predicted negative, really positive", "B. Predicted positive, really negative", "C. Predicted negative, really negative", "D. Predicted positive, really positive"], "correct": "C",
         "explanation": "True Negative: the model predicted negative and the real condition is negative.",
         "misconceptions": {
             "A": M("condition_vs_prediction", "Mixes up prediction and real condition, describing a False Negative.")}},
    ],
    "F1 Score": [
        {"question": "A model has very high precision but very low recall. What happens to its F1 score?",
         "options": ["A. It is high", "B. It is low", "C. It equals accuracy", "D. It cannot be computed"], "correct": "B",
         "explanation": "F1 is the harmonic mean, so it is dragged down by whichever of precision or recall is low.",
         "misconceptions": {
             "A": M("scope_overgeneralization", "Thinks one strong metric is enough, forgetting F1 punishes an imbalance between precision and recall.")}},
    ],
}


FIXTURE = Path(__file__).resolve().parents[2] / "demo" / "demo.json"
MARKER_PREFIX = "demo:"


def fixture() -> dict:
    """The demo fixture (demo/demo.json) as a dict."""
    if not FIXTURE.is_file():
        raise NotFoundError(f"Demo fixture not found: {FIXTURE}")
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def circle() -> dict:
    """The seeded study circle (friends, weekly gains, shared notes) the Study groups screen shows in demo mode."""
    return fixture()["circle"]


def _stamp(days_ago: int, hour: int = 9) -> str:
    moment = (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def _wipe(user_id: int):
    """Remove the previous demo documents (and the progress on their topics); the student's own uploads stay."""
    for doc in db.query("SELECT id FROM documents WHERE user_id = ? AND (source_url LIKE 'demo:%' OR file_name = ?)", (user_id, NOTES_FILE)):
        delete_document(user_id, doc["id"])


def seed_demo(user_id: int = 1):
    if user_id != settings.demo_user_id:   # demo data is never mixed into a real account
        raise ForbiddenError("The demo runs in demo mode only. Sign out and choose \"Try the demo\", or upload your own notes.")
    data = fixture()
    db.ensure_user(user_id)
    _wipe(user_id)
    by_name, documents, ml = {}, [], None
    for spec in data["documents"]:
        path = (FIXTURE.parent / spec["file"]).resolve()
        if not path.is_file():
            raise NotFoundError(f"Demo notes not found: {path}")
        res = ingest_document(user_id, Path(spec["file"]).name, path.read_text(encoding="utf-8"), use_llm=False)
        db.execute("UPDATE documents SET file_name = ?, source_kind = ?, source_url = ? WHERE id = ?", (spec["title"], spec["kind"], spec["marker"], res["document_id"]))
        for topic in res["topics_found"]:
            by_name[topic["topic_name"]] = topic["id"]
        documents.append({"document_id": res["document_id"], "title": spec["title"], "topics": [t["topic_name"] for t in res["topics_found"]]})
        if spec["marker"] == "demo:ml":
            ml = res
        for name, plan in spec["topics"].items():   # mastery with a week of history behind it
            topic_id = by_name.get(name)
            if topic_id is None:
                continue
            previous = 50.0
            for days_ago, value in plan["history"]:
                mastery_log.record(user_id, topic_id, "demo", previous, float(value), at=_stamp(days_ago))
                previous = float(value)
            db.execute("UPDATE learner_mastery SET mastery_score = ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ? AND topic_id = ?", (previous, user_id, topic_id))

    first_topic = next(iter(by_name.values()))
    for days_ago in data["active_days_ago"]:   # a 4-day streak: practice on today and the three days before
        db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question_id, question, student_answer, is_correct, confidence, mastery_before, mastery_after, answered_at) "
                   "VALUES (?, ?, NULL, 'Demo practice', 'B', 1, 0.6, 50, 52, ?)", (user_id, first_topic, _stamp(days_ago, 18)))
    today = datetime.now(timezone.utc).date()
    for card in data["flashcards"]:
        topic_id = by_name.get(card["topic"])
        if topic_id is None:
            continue
        box = card["box"]
        due = None if box == 0 else (today + timedelta(days=BOX_DAYS[box])).isoformat()
        db.execute("INSERT INTO flashcards (user_id, topic_id, front, back, source, box, due_on) VALUES (?, ?, ?, ?, 'notes', ?, ?)", (user_id, topic_id, card["front"], card["back"], box, due))

    count = 0
    questions = {**QUESTIONS, **data.get("questions", {})}
    for name, qs in questions.items():
        topic_id = by_name.get(name)
        if topic_id is None:
            continue
        for q in qs:
            options = q["misconceptions"]
            misconceptions = {k: (v if "label" in v else {"label": v.get("label", "definition_mixup"), "text": v.get("text", "")}) for k, v in options.items()}
            db.execute("INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) VALUES (?, ?, ?, ?, ?, ?)",
                       (topic_id, q["question"], db.dumps(q["options"]), q["correct"], q["explanation"], db.dumps(misconceptions)))
            count += 1
    log_agent(user_id, "learner_profile", "Demo seed", "Student starts at 38% on Precision, with a 4-day streak",
              f"Loaded {len(documents)} notes documents with {count} curated questions", 1.0)
    return {"seeded": True, "user_id": user_id, "document_id": ml["document_id"], "topics": ml["topics_found"], "questions": count, "documents": documents}
