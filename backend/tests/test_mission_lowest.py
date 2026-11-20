"""The next mission targets the topic with the LOWEST mastery in the Progress table, not the one with the loudest misconception."""
import conftest  # noqa: F401  (isolated DB before the app is imported)

from app import accounts, auth, db
from app.agents import study_mission
from app.services import demo_seed, guests
from main import app  # noqa: F401


def test_the_mission_names_the_lowest_started_topic_even_if_another_has_a_severe_misconception():
    user_id = auth.read_token(guests.create("203.0.113.88")["token"])
    try:
        topics = demo_seed.seed_demo(user_id)["topics"]
        a, b, c = topics[0], topics[1], topics[2]
        for topic, score in ((a, 62.0), (b, 31.0), (c, 55.0)):
            db.execute("UPDATE learner_mastery SET mastery_score = ? WHERE user_id = ? AND topic_id = ?", (score, user_id, topic["id"]))
            db.execute("INSERT INTO mastery_events (user_id, topic_id, source, mastery_before, mastery_after, delta) VALUES (?, ?, 'quiz', 50, ?, 0)",
                       (user_id, topic["id"], score))
        db.execute("INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity, resolved) VALUES (?, ?, 'x', 'x', 'high', 0)",
                   (user_id, a["id"]))   # a loud misconception on a topic that is NOT the lowest
        target, _ = study_mission._pick_target(user_id)
        assert target["topic_id"] == b["id"], (target["topic_name"], b["topic_name"])
        lowest = min(db.query("SELECT mastery_score FROM learner_mastery WHERE user_id = ? AND topic_id IN (?, ?, ?)", (user_id, a["id"], b["id"], c["id"])),
                     key=lambda r: r["mastery_score"])["mastery_score"]
        assert lowest == 31.0
    finally:
        accounts.erase_user(user_id)
