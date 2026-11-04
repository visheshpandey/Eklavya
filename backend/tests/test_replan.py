"""The study planner agent: which sessions were missed (pure), how the change is worded (pure), and the whole loop over HTTP."""
from datetime import date, timedelta

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.domain.replan import describe, missed_items, short_name
from app.services import plan_agent, progress_data, study_plan
from main import app  # noqa: F401
from tests.test_live import client

MON = date(2026, 11, 30)   # a Monday


def day(offset, *items):
    return {"date": (MON + timedelta(days=offset)).isoformat(),
            "items": [{"topic_id": tid, "topic": name, "kind": "learn", "minutes": 15} for tid, name in items]}


# ---------------------------------------------------------------- pure: what was missed
def test_a_session_with_no_trace_is_missed_and_a_done_one_is_not():
    days = [day(0, (1, "OS: Paging")), day(1, (2, "OS: Deadlock")), day(2, (3, "Recall"))]
    done = {(MON.isoformat(), 1)}
    missed = missed_items(days, MON, MON + timedelta(days=2), done)
    assert [m["topic_id"] for m in missed] == [2]   # day 0 done, day 1 missed, day 2 is today: not over yet


def test_only_days_since_the_last_plan_and_before_today_count():
    days = [day(0, (1, "A")), day(1, (2, "B")), day(2, (3, "C")), day(3, (4, "D"))]
    missed = missed_items(days, MON + timedelta(days=1), MON + timedelta(days=3), set())
    assert [m["topic_id"] for m in missed] == [2, 3]


def test_a_rest_day_is_never_missed_and_studying_on_another_day_does_not_cover_it():
    days = [day(0), day(1, (1, "Paging"))]
    assert missed_items(days, MON, MON + timedelta(days=2), {((MON + timedelta(days=2)).isoformat(), 1)}) == [
        {"date": days[1]["date"], "topic_id": 1, "topic": "Paging", "kind": "learn"}]
    assert missed_items([day(0)], MON, MON + timedelta(days=1), set()) == []


# ---------------------------------------------------------------- pure: the sentence
def test_the_message_names_the_topic_and_the_day_it_moved_to():
    today = MON + timedelta(days=2)   # Wednesday: Friday is two days away, so it is said by name
    missed = missed_items([day(0, (1, "OS: Paging")), day(1, (1, "OS: Paging"))], MON, today, set())
    note = describe(missed, [day(2, (9, "X")), day(4, (1, "OS: Paging"))], today)
    assert note["message"] == "You missed 2 days; I moved Paging to Friday."
    assert note["missed_days"] == 2 and note["moved"] == [{"topic_id": 1, "topic": "Paging", "date": day(4)["date"]}]


def test_today_and_tomorrow_are_said_as_words_and_one_day_is_singular():
    today = MON + timedelta(days=1)
    missed = [{"date": MON.isoformat(), "topic_id": 1, "topic": "Paging", "kind": "learn"}]
    assert describe(missed, [day(1, (1, "Paging"))], today)["message"] == "You missed 1 day; I moved Paging to today."
    assert describe(missed, [day(2, (1, "Paging"))], today)["message"] == "You missed 1 day; I moved Paging to tomorrow."


def test_several_topics_on_one_day_are_joined_and_extra_ones_are_counted():
    today = MON + timedelta(days=2)
    items = [(1, "A"), (2, "B"), (3, "C"), (4, "D"), (5, "E")]
    missed = missed_items([day(0, *items)], MON, today, set())
    new = [day(2, *items)]
    assert describe(missed, new, today)["message"] == "You missed 1 day; I moved A, B and C to today, and 2 more topics back into your plan."
    assert describe(missed[:2], new, today)["message"] == "You missed 1 day; I moved A and B to today."


def test_topics_moved_to_different_days_are_each_named_with_their_day():
    today = MON + timedelta(days=2)
    missed = missed_items([day(0, (1, "Paging"), (2, "Deadlock"))], MON, today, set())
    note = describe(missed, [day(2, (1, "Paging")), day(3, (2, "Deadlock"))], today)
    assert note["message"] == "You missed 1 day; I moved Paging to today, Deadlock to tomorrow."


def test_topics_on_the_same_day_are_named_together_even_when_other_days_follow():
    today = MON + timedelta(days=2)
    missed = missed_items([day(0, (1, "A"), (2, "B"), (3, "C"))], MON, today, set())
    note = describe(missed, [day(2, (1, "A"), (2, "B")), day(3, (3, "C"))], today)
    assert note["message"] == "You missed 1 day; I moved A and B to today, C to tomorrow."


def test_a_missed_topic_that_is_not_in_the_new_plan_still_gets_an_honest_message():
    today = MON + timedelta(days=1)
    missed = [{"date": MON.isoformat(), "topic_id": 7, "topic": "Paging", "kind": "learn"}]
    note = describe(missed, [day(1, (1, "Other"))], today)
    assert note["moved"] == [] and note["message"].startswith("You missed 1 day; I rebuilt your plan")


def test_nothing_missed_means_no_message():
    assert describe([], [day(1, (1, "A"))], MON) is None
    assert short_name("OS: Paging") == "Paging" and short_name("Paging") == "Paging"


# ---------------------------------------------------------------- the loop
@pytest.fixture
def student():
    made = client.post("/api/guest").json()
    headers = {"Authorization": f"Bearer {made['token']}"}
    assert client.post("/api/demo/seed", headers=headers).status_code == 200
    user_id = client.get("/api/auth/me", headers=headers).json()["id"]
    yield user_id, headers
    accounts.erase_user(user_id)


def _exam(days):
    return (progress_data.local_today() + timedelta(days=days)).isoformat()


def _rewind(user_id, days):
    """Pretend the plan was built ``days`` days ago and the student has done nothing since: shift the snapshot back, and the study history before it."""
    snapshot = plan_agent._load(user_id)
    built = date.fromisoformat(snapshot["built_on"]) - timedelta(days=days)
    snapshot["built_on"] = built.isoformat()
    snapshot["days"] = [{"date": (date.fromisoformat(d["date"]) - timedelta(days=days)).isoformat(), "items": d["items"]} for d in snapshot["days"]]
    plan_agent._save(user_id, snapshot)


def _log(user_id):
    return [r for r in db.query("SELECT observation, decision FROM agent_logs WHERE user_id = ? AND agent_name = 'study_planner' ORDER BY id", (user_id,))]


def test_setting_an_exam_date_builds_the_plan_and_logs_the_decision(student):
    user_id, headers = student
    res = client.put("/api/plan", headers=headers, json={"exam_date": _exam(10), "minutes_per_day": 30}).json()
    assert res["plan"]["days"] and res["replan"] is None
    assert plan_agent._load(user_id)["exam_date"] == _exam(10)
    assert "Built a plan" in _log(user_id)[0]["decision"]


def test_the_same_day_keeps_the_snapshot_and_makes_no_noise(student):
    user_id, headers = student
    client.put("/api/plan", headers=headers, json={"exam_date": _exam(10), "minutes_per_day": 30})
    for _ in range(3):
        assert client.get("/api/plan", headers=headers).json()["replan"] is None
    assert len(_log(user_id)) == 1


def test_missed_days_are_replanned_and_said_once_with_a_log_entry(student):
    user_id, headers = student
    client.put("/api/plan", headers=headers, json={"exam_date": _exam(12), "minutes_per_day": 30})
    # nothing was studied on the planned days (the demo's own history is on the demo's days): rewind so the planned days are in the past
    _rewind(user_id, 2)
    db.execute("DELETE FROM mastery_events WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM quiz_attempts WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM flashcards WHERE user_id = ?", (user_id,))
    res = client.get("/api/plan", headers=headers).json()
    note = res["replan"]
    assert note and note["message"].startswith("You missed 2 days; I moved ")
    assert note["moved"] and res["plan"]["days"][0]["date"] == progress_data.local_today().isoformat()
    assert any("Re-planned" in r["decision"] for r in _log(user_id))
    # opened again the same day: the same note stays (it was said this morning), and nothing new is logged
    before = len(_log(user_id))
    assert client.get("/api/plan", headers=headers).json()["replan"] == note
    assert len(_log(user_id)) == before


def test_studying_the_planned_topic_on_its_day_is_not_a_miss(student):
    user_id, headers = student
    client.put("/api/plan", headers=headers, json={"exam_date": _exam(12), "minutes_per_day": 30})
    snapshot = plan_agent._load(user_id)
    planned = {(d["date"], i["topic_id"]) for d in snapshot["days"][:2] for i in d["items"]}
    for when, topic_id in planned:   # evidence on exactly those days
        db.execute("INSERT INTO mastery_events (user_id, topic_id, source, mastery_before, mastery_after, delta, at) VALUES (?, ?, 'quiz', 50, 55, 5, ?)",
                   (user_id, topic_id, f"{when} 10:00:00"))
    _rewind(user_id, 2)
    snapshot = plan_agent._load(user_id)
    planned = {(d["date"], i["topic_id"]) for d in snapshot["days"][:2] for i in d["items"]}
    db.execute("DELETE FROM mastery_events WHERE user_id = ?", (user_id,))
    for when, topic_id in planned:
        db.execute("INSERT INTO mastery_events (user_id, topic_id, source, mastery_before, mastery_after, delta, at) VALUES (?, ?, 'quiz', 50, 55, 5, ?)",
                   (user_id, topic_id, f"{when} 10:00:00"))
    assert client.get("/api/plan", headers=headers).json()["replan"] is None
    assert any("on track" in r["decision"] for r in _log(user_id))


def test_changing_the_exam_date_rebuilds_without_blaming_the_student(student):
    user_id, headers = student
    client.put("/api/plan", headers=headers, json={"exam_date": _exam(12), "minutes_per_day": 30})
    _rewind(user_id, 3)
    res = client.put("/api/plan", headers=headers, json={"exam_date": _exam(20), "minutes_per_day": 30}).json()
    assert res["replan"] is None
    assert plan_agent._load(user_id)["exam_date"] == _exam(20)


def test_removing_the_exam_date_forgets_the_snapshot(student):
    user_id, headers = student
    client.put("/api/plan", headers=headers, json={"exam_date": _exam(12), "minutes_per_day": 30})
    assert plan_agent._load(user_id)
    assert client.delete("/api/plan", headers=headers).json()["plan"] is None
    assert plan_agent._load(user_id) is None


def test_stale_topics_are_planned_as_the_weak_ones_they_became(student):
    user_id, _ = student
    topic = db.one("SELECT t.id AS id FROM topics t JOIN documents d ON d.id = t.document_id WHERE d.user_id = ? ORDER BY t.id", (user_id,))["id"]
    db.execute("UPDATE learner_mastery SET mastery_score = 80, last_updated = '2026-01-01 00:00:00' WHERE user_id = ? AND topic_id = ?", (user_id, topic))
    seen = {t["topic_id"]: t["mastery"] for t in plan_agent.planning_topics(user_id)}
    assert seen[topic] < 80   # forgotten: not planned as if it were still fresh


def test_the_shared_demo_student_gets_a_plan_too():
    res = study_plan.set_plan(1, _exam(9), 30) if db.one("SELECT 1 AS x FROM topics t JOIN documents d ON d.id=t.document_id WHERE d.user_id = 1") else None
    if res is not None:
        assert "replan" in res
    study_plan.clear_plan(1)
