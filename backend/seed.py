"""One-click demo data: ML notes, curated questions with per-option misconceptions, student at 38% on Precision.

POST /api/demo/seed resets user data for the demo user and rebuilds it. Curated questions mean the
demo quiz and misconception diagnosis work even if the LLM is down.
"""
import os

import db
from agents.document_intelligence import ingest_document
from agents.logger import log_agent

NOTES = os.path.join(os.path.dirname(__file__), "..", "samples", "ml_notes.txt")

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


def _wipe(user_id: int):
    docs = [d["id"] for d in db.query("SELECT id FROM documents WHERE user_id = ?", (user_id,))]
    with db.get_conn() as c:
        for table in ("quiz_attempts", "misconceptions", "study_missions", "agent_logs", "learner_state", "learner_mastery"):
            c.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        for d in docs:
            c.execute("DELETE FROM quiz_questions WHERE topic_id IN (SELECT id FROM topics WHERE document_id = ?)", (d,))
            for table in ("chunks", "topics"):
                c.execute(f"DELETE FROM {table} WHERE document_id = ?", (d,))
        c.execute("DELETE FROM documents WHERE user_id = ?", (user_id,))


def seed_demo(user_id: int = 1):
    db.ensure_user(user_id)
    _wipe(user_id)
    with open(NOTES, encoding="utf-8") as f:
        res = ingest_document(user_id, "ml_notes.txt", f.read(), use_llm=False)
    by_name = {t["topic_name"]: t["id"] for t in res["topics_found"]}
    for name, score in START_MASTERY.items():
        if name in by_name:
            db.execute("UPDATE learner_mastery SET mastery_score = ? WHERE user_id = ? AND topic_id = ?",
                       (score, user_id, by_name[name]))
    n = 0
    for name, qs in QUESTIONS.items():
        if name not in by_name:
            continue
        for q in qs:
            db.execute(
                "INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) VALUES (?, ?, ?, ?, ?, ?)",
                (by_name[name], q["question"], db.dumps(q["options"]), q["correct"], q["explanation"], db.dumps(q["misconceptions"])))
            n += 1
    log_agent(user_id, "learner_profile", "Demo seed", "Student starts at 38% on Precision",
              f"Loaded ml_notes.txt with {n} curated questions", 1.0)
    return {"seeded": True, "user_id": user_id, "document_id": res["document_id"],
            "topics": res["topics_found"], "questions": n}
