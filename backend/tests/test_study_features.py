"""Phase 2-4 features: streak, spaced revision, exam planner, concept map, flashcards, meaning search,
photo notes, Today screen, viva and debate scoring, quick revision, photos in a live session."""
import base64
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

from app import db
from app.ai import embeddings, gemini, live
from app.domain import retrieval
from app.domain.concept_map import build_links
from app.domain.planner import build_plan, sessions_needed
from app.domain.revision import due_topics, interval_days
from app.domain.scoring import argument_score, debate_winner, viva_mark, viva_total
from app.domain.streak import study_streak
from app.services import search
from test_live import FakeSession, call, client, collect, fake_connect, sc, seeded  # noqa: F401  (seeded = autouse fixture)

TODAY = date(2026, 10, 27)


def topic_id(name):
    return db.one("SELECT id FROM topics WHERE topic_name = ? ORDER BY id DESC", (name,))["id"]


# ------------------------------------------------------------------ pure rules

def test_streak_counts_back_from_today_or_yesterday():
    days = {TODAY - timedelta(days=n) for n in (0, 1, 2, 4)}
    assert study_streak(days, TODAY) == 3
    assert study_streak({TODAY - timedelta(days=1), TODAY - timedelta(days=2)}, TODAY) == 2   # today not over yet
    assert study_streak({TODAY - timedelta(days=3)}, TODAY) == 0


def test_weak_topics_come_back_sooner_and_due_ones_are_ordered():
    assert [interval_days(m) for m in (20, 50, 70, 80, 95)] == [1, 2, 4, 7, 14]
    topics = [
        {"topic_id": 1, "topic_name": "A", "mastery": 30, "last_practised": TODAY - timedelta(days=3)},   # 2 days overdue
        {"topic_id": 2, "topic_name": "B", "mastery": 95, "last_practised": TODAY - timedelta(days=3)},   # not due
        {"topic_id": 3, "topic_name": "C", "mastery": 50, "last_practised": TODAY - timedelta(days=2)},   # due today
        {"topic_id": 4, "topic_name": "D", "mastery": 10, "last_practised": None},                        # new, not due
    ]
    due = due_topics(topics, TODAY)
    assert [t["topic_id"] for t in due] == [1, 3] and due[0]["overdue_days"] == 2


def test_exam_plan_spreads_weak_topics_and_keeps_the_last_day_for_revision():
    topics = [{"topic_id": 1, "topic_name": "Precision", "mastery": 38},
              {"topic_id": 2, "topic_name": "Recall", "mastery": 90}]
    plan = build_plan(topics, TODAY, TODAY + timedelta(days=7), minutes_per_day=30)
    assert plan["days_left"] == 7 and len(plan["days"]) == 7
    precision_days = [d["date"] for d in plan["days"][:-1] if any(i["topic_id"] == 1 for i in d["items"])]
    assert len(precision_days) == sessions_needed(38) == 4 and len(set(precision_days)) == 4   # spread, not crammed
    assert plan["days"][0]["items"][0] == {"topic_id": 1, "topic": "Precision", "kind": "learn", "minutes": 15}
    assert all(i["kind"] == "revise" for i in plan["days"][-1]["items"])
    assert all(len(d["items"]) <= 2 for d in plan["days"][:-1])                                 # 30 min = 2 sessions a day
    with pytest.raises(ValueError):
        build_plan(topics, TODAY, TODAY, 30)


def test_concept_map_links_topics_whose_notes_mention_each_other():
    topics = [{"id": 1, "topic_name": "Precision"}, {"id": 2, "topic_name": "Recall"}, {"id": 3, "topic_name": "F1 Score"}]
    chunks = [{"topic_id": 3, "heading": "F1 Score", "text": "F1 combines precision and recall as a harmonic mean."},
              {"topic_id": 1, "heading": "Precision", "text": "Unlike recall, precision looks at flagged emails."},
              {"topic_id": None, "heading": "", "text": "precision recall"}]
    links = {(l["source"], l["target"]): l["weight"] for l in build_links(topics, chunks)}
    assert links == {(1, 3): 1, (2, 3): 1, (1, 2): 1}


def test_marks_and_scores_are_clamped_and_summed():
    assert [viva_mark(v) for v in (2.4, 1.3, -1, "x")] == [2.0, 1.5, 0.0, 0.0]
    assert viva_total([2, 1.5, 1, 0, 2]) == {"marks": 6.5, "out_of": 10, "percent": 65}
    assert argument_score(8, 12, "6") == {"evidence": 8.0, "logic": 10.0, "rebuttal": 6.0, "strength": 8.0}
    assert (debate_winner(7, 5), debate_winner(5, 7.2), debate_winner(6, 6.3)) == ("student", "eklavya", "draw")


def test_meaning_search_finds_a_paraphrase_but_not_an_unrelated_question():
    rows = [{"id": 1, "heading": "Recall", "text": "Recall = TP / (TP + FN)", "topic": "Recall", "topic_id": 1,
             "page": None, "document": "n", "document_id": 1},
            {"id": 2, "heading": "Precision", "text": "Precision = TP / (TP + FP)", "topic": "Precision", "topic_id": 2,
             "page": None, "document": "n", "document_id": 1}]
    vectors = {1: [1.0, 0.0, 0.0], 2: [0.0, 1.0, 0.0]}
    hits = retrieval.rank(rows, "kitne asli spam pakde", 4, query_vector=[0.95, 0.05, 0.0], vectors=vectors)
    assert [h["topic"] for h in hits] == ["Recall"]                       # no shared words, found by meaning
    unrelated = [0.3, 0.3, 0.9]                                           # cosine 0.30 with both: under the cutoff
    assert retrieval.rank(rows, "cricket score", 4, query_vector=unrelated, vectors=vectors) == []


# ------------------------------------------------------------------ services and endpoints

def test_upload_embeds_chunks_and_search_uses_them(monkeypatch):
    calls = []

    def fake_embed(texts, task):
        calls.append(task)
        # the recall passage and a paraphrase of "recall" point the same way; everything else points elsewhere
        return [[1.0, 0.0] if ("recall" in t.lower() and "precision" not in t.lower()) or "pakde" in t else [0.0, 1.0]
                for t in texts]

    monkeypatch.setattr(embeddings, "embed", fake_embed)
    embeddings._query_vector.cache_clear()
    doc = client.post("/api/demo/seed").json()["document_id"]
    assert calls == ["RETRIEVAL_DOCUMENT"]
    demo_chunks = "SELECT id FROM chunks WHERE document_id = ?"
    assert (db.one(f"SELECT COUNT(*) AS n FROM chunk_embeddings WHERE chunk_id IN ({demo_chunks})", (doc,))["n"]
            == db.one("SELECT COUNT(*) AS n FROM chunks WHERE document_id = ?", (doc,))["n"] > 0)
    hits = search.search(1, "kitne asli wale pakde", document_id=doc)      # shares no word with the notes
    assert hits and hits[0]["topic"] == "Recall" and calls[-1] == "RETRIEVAL_QUERY"


def test_failed_embeddings_leave_word_search_working(monkeypatch):
    def broken(texts, task):
        raise RuntimeError("quota")

    monkeypatch.setattr(embeddings, "embed", broken)
    embeddings._query_vector.cache_clear()
    doc = client.post("/api/demo/seed").json()["document_id"]
    assert db.one("SELECT COUNT(*) AS n FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)",
                  (doc,))["n"] == 0
    assert search.search(1, "precision")[0]["topic"] == "Precision"
    assert "search by words only" in db.one("SELECT action_taken FROM agent_logs WHERE agent_name = 'document_intelligence' "
                                            "ORDER BY id DESC LIMIT 1")["action_taken"]


def test_today_shows_streak_due_revision_plan_and_last_session():
    for table in ("quiz_attempts", "voice_sessions", "study_missions"):   # start from a student with no history
        db.execute(f"DELETE FROM {table} WHERE user_id = 1")
    prec = topic_id("Precision")
    data = client.get("/api/today").json()
    assert data["has_notes"] and data["streak"] == 0 and data["due"] == []
    assert data["plan"][0]["kind"] == "learn" and data["plan"][0]["topic"] == "Precision"   # weakest new topic

    old = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")   # plain text: works on SQLite and Postgres
    db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question, is_correct, mastery_before, mastery_after, answered_at) "
               "VALUES (1, ?, 'q', 0, 38, 33, ?)", (prec, old))
    db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question, is_correct, mastery_before, mastery_after) "
               "VALUES (1, ?, 'q', 1, 50, 57)", (topic_id("Recall"),))
    db.execute("INSERT INTO voice_sessions (user_id, mode, study_mode, topic_id, turns) VALUES (1, 'gemini-live', 'viva', ?, 6)", (prec,))
    data = client.get("/api/today").json()
    assert data["streak"] == 1
    assert [d["topic"] for d in data["due"]] == ["Precision"]                 # 38% comes back after 1 day, 3 days ago
    assert data["plan"][0] == {"kind": "revise", "topic_id": prec, "topic": "Precision", "minutes": 5,
                               "reason": data["plan"][0]["reason"]}
    assert data["last_session"]["mode_name"] == "Viva practice" and data["last_session"]["topic"] == "Precision"


def test_exam_plan_endpoint_saves_validates_and_clears():
    assert client.get("/api/plan").json()["plan"] is None
    exam = (date.today() + timedelta(days=10)).isoformat()
    saved = client.put("/api/plan", json={"exam_date": exam, "minutes_per_day": 45}).json()
    assert saved["exam_date"] == exam and saved["minutes_per_day"] == 45 and saved["plan"]["days"]
    assert client.get("/api/today").json()["exam_days_left"] in (9, 10, 11)   # local vs UTC day boundary
    bad = client.put("/api/plan", json={"exam_date": date.today().isoformat()})
    assert bad.status_code == 400 and "after today" in bad.json()["error"]
    assert client.put("/api/plan", json={"exam_date": "15-12-2026"}).status_code == 400
    assert client.delete("/api/plan").json()["exam_date"] is None


def test_concept_map_endpoint_returns_topics_with_mastery_and_links():
    data = client.get("/api/concept-map").json()
    assert {n["topic"] for n in data["nodes"]} >= {"Precision", "Recall", "F1 Score"}
    names = {n["id"]: n["topic"] for n in data["nodes"]}
    pairs = {frozenset((names[l["source"]], names[l["target"]])) for l in data["links"]}
    assert frozenset(("F1 Score", "Precision")) in pairs


def test_flashcards_from_notes_and_from_mistakes(monkeypatch):
    prec = topic_id("Precision")
    qid = db.execute("INSERT INTO quiz_questions (topic_id, question, options, correct, explanation, misconceptions) VALUES (?, ?, ?, 'B', ?, ?)",
                     (prec, "Which formula gives precision?", db.dumps(["A. TP / (TP + FN)", "B. TP / (TP + FP)", "C. TP / all", "D. none"]),
                      "Precision divides by everything flagged positive.", db.dumps({"A": {"label": "formula_inversion", "text": "Uses the recall formula for precision"}})))
    # the student chose A (a recorded mistake), then answered correctly after a follow-up: the mistake still gets a card
    db.execute("INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity, resolved, question_id) VALUES (1, ?, ?, 'x', 'high', 1, ?)",
               (prec, "Uses the recall formula for precision", qid))
    db.execute("INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity, resolved, question_id) VALUES (1, ?, ?, 'x', 'high', 1, ?)",
               (prec, "Uses the recall formula for precision", qid))   # the same question twice: still one card

    def fake(system, prompt, required_keys=(), temperature=0.7, **_):
        assert "flashcards" in system and "Precision" in prompt
        return {"success": True, "data": {"cards": [{"front": "Precision?", "back": "TP / (TP + FP)"}, {"front": "", "back": "x"}]}}

    monkeypatch.setattr(gemini, "call_llm_json", fake)
    cards = client.post("/api/flashcards/generate", json={"topic_id": prec}).json()["cards"]
    assert [(c["front"], c["source"]) for c in cards] == [("Precision?", "notes"), ("Which formula gives precision?", "mistake")]
    back = cards[1]["back"]                                                         # the right answer, why, and the wrong belief
    assert "B. TP / (TP + FP)" in back and "everything flagged" in back and "Uses the recall formula for precision" in back
    again = client.post("/api/flashcards/generate", json={"topic_id": prec}).json()["cards"]
    assert len(again) == 2                                                          # replaced, not duplicated
    assert len(client.get(f"/api/flashcards?topic_id={prec}").json()["cards"]) == 2


def test_photo_of_notes_is_read_by_gemini_and_ingested(monkeypatch):
    seen = {}

    def fake_read(data, mime):
        seen["mime"] = mime
        return "Bayes Theorem\n\nP(A|B) = P(B|A) P(A) / P(B). It updates a belief after seeing evidence, for example a medical test."

    def fake_topics(system, prompt, required_keys=(), temperature=0.7, **_):
        return {"success": True, "data": {"topics": ["Bayes Theorem"]}}

    from app.api.routes import documents
    monkeypatch.setattr(documents, "read_image", fake_read)
    monkeypatch.setattr(gemini, "call_llm_json", fake_topics)
    res = client.post("/api/upload-document", files={"file": ("page.JPG", b"\xff\xd8fakejpeg", "image/jpeg")}).json()
    assert seen["mime"] == "image/jpeg" and [t["topic_name"] for t in res["topics_found"]] == ["Bayes Theorem"]

    monkeypatch.setattr(documents, "read_image", lambda data, mime: "")
    blank = client.post("/api/upload-document", files={"file": ("blank.png", b"x", "image/png")})
    assert blank.status_code == 400 and "photo" in blank.json()["error"]


# ------------------------------------------------------------------ live modes

def run_session(monkeypatch, url, script, send=None):
    fake = FakeSession(script)
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    events = []
    with client.websocket_connect(url) as ws:
        if send:
            ws.send_json(send)
        for _ in script:
            ev, _audio = collect(ws)
            events += ev
    return fake, events


def test_viva_marks_answers_moves_mastery_and_shows_a_report_card(monkeypatch):
    prec = topic_id("Precision")
    turns = []
    for n in range(5):
        turns.append([call("ask_viva_question", {"question": f"Question {n + 1}?"}, f"q{n}"), sc(turn_complete=True)])
        turns.append([call("mark_viva_answer", {"mark": [2, 1.5, 1, 0, 2][n], "feedback": "ok", "answer_summary": "a"}, f"m{n}"),
                      sc(turn_complete=True)])
    turns.append([call("finish_viva", {"strengths": "Clear formulas", "improve": "Give examples"}, "f"), sc(turn_complete=True)])
    fake, events = run_session(monkeypatch, f"/ws/voice?mode=viva&topic_id={prec}", turns)

    assert "viva mode" in fake.system_prompt and "VIVA" in fake.system_prompt and "{{" not in fake.system_prompt
    assert {d.name for d in fake.tools[0].function_declarations} >= {"ask_viva_question", "mark_viva_answer", "finish_viva"}
    assert "ask_quiz_question" not in {d.name for d in fake.tools[0].function_declarations}
    assert next(e for e in events if e["type"] == "phase") == {"type": "phase", "phase": "viva", "topic": "Precision"}
    questions = [e for e in events if e["type"] == "viva_question"]
    assert [q["number"] for q in questions] == [1, 2, 3, 4, 5] and questions[0]["seconds"] == 90
    report = next(e for e in events if e["type"] == "viva_report")
    assert (report["marks"], report["out_of"], report["percent"]) == (6.5, 10, 65) and len(report["answers"]) == 5
    row = db.one("SELECT * FROM vivas ORDER BY id DESC LIMIT 1")
    assert row["marks"] == 6.5 and row["finished_at"] and row["improve"] == "Give examples"
    assert db.one("SELECT COUNT(*) AS n FROM quiz_attempts WHERE question LIKE 'Viva:%'")["n"] == 5
    assert db.one("SELECT mastery_score FROM learner_mastery WHERE topic_id = ?", (prec,))["mastery_score"] != 38
    assert client.get("/api/history").json()["vivas"][0]["marks"] == 6.5
    assert db.one("SELECT study_mode, topic_id FROM voice_sessions ORDER BY id DESC LIMIT 1") == {"study_mode": "viva", "topic_id": prec}


def test_marking_without_a_question_is_refused(monkeypatch):
    prec = topic_id("Precision")
    fake, _ = run_session(monkeypatch, f"/ws/voice?mode=viva&topic_id={prec}",
                          [[call("mark_viva_answer", {"mark": 2, "feedback": "x"}, "m"), sc(turn_complete=True)]])
    assert "error" in {r.id: r.response for r in fake.tool_responses}["m"]


def test_debate_scores_each_argument_and_records_the_verdict(monkeypatch):
    prec = topic_id("Precision")
    script = [[call("score_argument", {"evidence": 7, "logic": 6, "rebuttal": 5, "note": "good example"}, "s1"), sc(turn_complete=True)],
              [call("score_argument", {"evidence": 9, "logic": 8, "rebuttal": 7}, "s2"), sc(turn_complete=True)],
              [call("finish_debate", {"student_score": 7.5, "eklavya_score": 6, "strength": "spam example",
                                      "improve": "use numbers"}, "f"), sc(turn_complete=True)]]
    fake, events = run_session(monkeypatch, f"/ws/voice?mode=debate&topic_id={prec}&side=against&style=friendly", script)
    assert "Friendly sparring partner" in fake.system_prompt and "score_argument" in fake.system_prompt
    scores = [e for e in events if e["type"] == "debate_score"]
    assert [(s["round"], s["strength"], s["average"]) for s in scores] == [(1, 6.0, 6.0), (2, 8.0, 7.0)]
    verdict = next(e for e in events if e["type"] == "debate_verdict")
    assert verdict["winner"] == "student" and verdict["rounds"] == 2
    saved = client.get("/api/history").json()["debates"][0]
    assert (saved["winner"], saved["tutor_side"], saved["style"]) == ("student", "against", "friendly")


def test_quick_revision_is_a_recap_and_two_questions(monkeypatch):
    rec = topic_id("Recall")
    fake, events = run_session(monkeypatch, f"/ws/voice?mode=revise&topic_id={rec}", [[sc(turn_complete=True)]])
    assert "QUICK REVISION" in fake.system_prompt and "2-question check" in fake.system_prompt
    assert next(e for e in events if e["type"] == "phase")["phase"] == "revise"
    assert any("Quick revision" in str(s.get("text", "")) for s in fake.sent)


def test_a_photo_in_a_live_session_is_sent_to_gemini_as_an_image(monkeypatch):
    jpeg = b"\xff\xd8\xff" + b"0" * 100
    photo = {"type": "photo", "mime": "image/jpeg", "data": base64.b64encode(jpeg).decode(), "note": "yeh sawal"}
    fake, _ = run_session(monkeypatch, "/ws/voice", [[sc(turn_complete=True)]], send=photo)
    import time
    time.sleep(0.2)
    turns = [s["content"] for s in fake.sent if s.get("content") is not None]
    assert turns and turns[0].role == "user"                        # a normal turn, not a video frame (Live ignores those)
    image, text = turns[0].parts
    assert image.inline_data.mime_type == "image/jpeg" and image.inline_data.data == jpeg
    assert "showed you this photo" in text.text and "yeh sawal" in text.text
    assert not any(s.get("video") is not None for s in fake.sent)


def test_a_bad_photo_is_refused_with_a_clear_message(monkeypatch):
    fake = FakeSession([])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "photo", "mime": "image/gif", "data": base64.b64encode(b"GIF89a").decode()})
        msg = ws.receive_json()
    assert msg["type"] == "error" and "JPG, PNG or WebP" in msg["message"]


def test_transcription_markers_never_reach_the_student(monkeypatch):
    script = [[sc(output_transcription=NS(text="<no speech>")), sc(output_transcription=NS(text="{pause}")), sc(turn_complete=True)],
              [sc(output_transcription=NS(text="Haan, ")), sc(output_transcription=NS(text="{pause}theek hai.")), sc(turn_complete=True)]]
    fake, events = run_session(monkeypatch, "/ws/voice", script)
    texts = [e["text"] for e in events if e["type"] == "transcript"]
    assert all("<no speech>" not in t and "{pause}" not in t for t in texts)
    finals = [e["text"] for e in events if e["type"] == "transcript" and e["final"]]
    assert finals == ["Haan, theek hai."]                      # the marker-only turn left no empty bubble


# ------------------------------------------------------------------ QA fixes

def graded(ctx, answer, question_id):
    import asyncio
    from app.ai import tools
    ctx.current_question_id = question_id
    return asyncio.run(tools.grade_answer(ctx, answer, 0.5))


def make_ctx(topic, emitted):
    from app.ai import tools

    async def emit(event):
        emitted.append(event)

    return tools.ToolContext(user_id=1, document_id=None, emit=emit, focus_topic_id=topic, mode="test",
                             topics=[{"id": topic, "topic_name": "Precision"}])


def test_a_follow_up_answer_replaces_the_first_try_instead_of_using_up_a_question(monkeypatch):
    from app.agents import quiz
    prec = topic_id("Precision")
    emitted = []
    ctx = make_ctx(prec, emitted)
    first = quiz.next_question(1, prec, [])
    wrong = next(letter for letter in "ABCD" if letter != db.one("SELECT correct FROM quiz_questions WHERE id = ?", (first["question_id"],))["correct"])
    right = db.one("SELECT correct FROM quiz_questions WHERE id = ?", (first["question_id"],))["correct"]
    attempts_before = db.one("SELECT COUNT(*) AS n FROM quiz_attempts")["n"]
    mastery_before = db.one("SELECT mastery_score FROM learner_mastery WHERE topic_id = ?", (prec,))["mastery_score"]

    graded(ctx, wrong, first["question_id"])
    assert len(ctx.results) == 1 and not ctx.results[0]["is_correct"]
    graded(ctx, right, first["question_id"])                          # the follow-up retry of the SAME question
    assert len(ctx.results) == 1 and ctx.results[0]["is_correct"]     # replaced, not appended: still one question answered
    assert db.one("SELECT COUNT(*) AS n FROM quiz_attempts")["n"] == attempts_before + 1   # one attempt row for the question
    final = db.one("SELECT mastery_before, mastery_after, is_correct FROM quiz_attempts ORDER BY id DESC LIMIT 1")
    assert final["mastery_before"] == mastery_before and final["is_correct"] == 1   # mastery moves from the value before try 1
    mastery_events = [e for e in emitted if e["type"] == "mastery"]
    assert [e["retry"] for e in mastery_events] == [False, True]
    from app.agents import flashcards
    assert db.one("SELECT question_id FROM misconceptions ORDER BY id DESC LIMIT 1")["question_id"] == first["question_id"]
    cards = flashcards.mistake_cards(1, prec)                         # corrected after the follow-up, still a mistake worth a card
    assert cards and cards[0][0].startswith(first["question"][:20]) and "Answer:" in cards[0][1]
    assert mastery_events[1]["chosen"] == right and mastery_events[1]["correct_answer"] == right
    assert not any(e["type"] == "test_summary" for e in emitted)      # 1 of 3 questions: the test is not over


def test_the_test_needs_three_distinct_questions_and_the_summary_comes_once(monkeypatch):
    from app.ai import tools
    import asyncio
    from app.agents import quiz
    prec = topic_id("Precision")
    emitted = []
    ctx = make_ctx(prec, emitted)
    ids = []
    for _ in range(3):
        q = asyncio.run(tools.ask_quiz_question(ctx))
        assert q["available"], q
        ids.append(q["question"])
        qid = ctx.current_question_id
        wrong = next(l for l in "ABCD" if l != db.one("SELECT correct FROM quiz_questions WHERE id = ?", (qid,))["correct"])
        graded(ctx, wrong, qid)
        graded(ctx, db.one("SELECT correct FROM quiz_questions WHERE id = ?", (qid,))["correct"], qid)   # a follow-up each time
    assert len(set(ids)) == 3 and len(ctx.results) == 3
    summaries = [e for e in emitted if e["type"] == "test_summary"]
    # the card is re-sent when the follow-up retry of the last question changes the result; the final one is right
    assert [(s["correct"], s["total"]) for s in summaries] == [(2, 3), (3, 3)]


def test_asking_for_the_next_question_before_the_current_one_is_graded_is_refused():
    import asyncio
    from app.ai import tools
    prec = topic_id("Precision")
    ctx = make_ctx(prec, [])
    assert asyncio.run(tools.ask_quiz_question(ctx))["available"]
    again = asyncio.run(tools.ask_quiz_question(ctx))
    assert again["available"] is False and "no graded answer" in again["message"]


def test_the_mission_after_a_test_is_rewritten_from_live_mastery_once(monkeypatch):
    import asyncio
    from app.ai import tools
    from app.agents import study_mission
    seen = []
    monkeypatch.setattr(study_mission, "generate", lambda uid: seen.append("generate") or {
        "mission_title": "t", "duration_minutes": 15, "priority": "High", "reason": "r", "tasks": ["a"]})
    monkeypatch.setattr(study_mission, "current", lambda uid: seen.append("current") or {
        "mission_title": "t", "duration_minutes": 15, "priority": "High", "reason": "r", "tasks": ["a"]})
    ctx = make_ctx(topic_id("Precision"), [])
    asyncio.run(tools.get_mission(ctx))
    assert seen == ["current"]                                   # no answers yet: the existing mission
    ctx.results.append({"question_id": 1})
    asyncio.run(tools.get_mission(ctx))
    asyncio.run(tools.get_mission(ctx))
    assert seen == ["current", "generate", "current"]            # rewritten once after answers, then reused


def test_a_viva_answer_to_a_different_question_gets_zero(monkeypatch):
    prec = topic_id("Precision")
    script = [[call("ask_viva_question", {"question": "What does FP mean?"}, "q"), sc(turn_complete=True)],
              [call("mark_viva_answer", {"mark": 2, "feedback": "Correct and clear.", "answers_the_question": False}, "m"), sc(turn_complete=True)]]
    fake, events = run_session(monkeypatch, f"/ws/voice?mode=viva&topic_id={prec}", script)
    mark = next(e for e in events if e["type"] == "viva_mark")
    assert mark["mark"] == 0 and "did not address the question" in mark["feedback"]
    declared = {d.name: d for d in fake.tools[0].function_declarations}["mark_viva_answer"]
    assert "answers_the_question" in declared.parameters.required


def test_whiteboards_of_the_day_are_kept_across_sessions_and_the_dashboard_lists_every_mistake():
    import asyncio
    from app.ai import tools
    prec = topic_id("Precision")
    db.execute("DELETE FROM boards")
    for title in ("Precision", "Recall"):
        asyncio.run(tools.show_board(make_ctx(prec, []), kind="steps", title=title, items=["a", "b"]))
    assert [b["title"] for b in client.get("/api/boards").json()["boards"]] == ["Precision", "Recall"]
    db.execute("INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity, resolved) VALUES (1, ?, 'old slip', 'x', 'low', 1)", (prec,))
    db.execute("INSERT INTO misconceptions (user_id, topic_id, misconception_text, label, severity, resolved) VALUES (1, ?, 'new slip', 'x', 'high', 0)", (prec,))
    mistakes = client.get("/api/dashboard").json()["mistakes"]
    assert [(m["text"], m["resolved"]) for m in mistakes][:2] == [("new slip", 0), ("old slip", 1)]   # open first, resolved marked


def test_today_uses_the_exam_plan_when_there_is_one():
    plan_day = (date.today() + timedelta(days=10)).isoformat()
    client.put("/api/plan", json={"exam_date": plan_day, "minutes_per_day": 45})
    today = client.get("/api/today").json()
    planner_today = client.get("/api/plan").json()["plan"]["days"][0]["items"]
    assert [(i["topic_id"], i["kind"], i["minutes"]) for i in today["plan"]] == [(i["topic_id"], i["kind"], i["minutes"]) for i in planner_today]
    assert len(today["plan"]) == 3 and today["plan_minutes"] == 45     # 45 minutes a day = 3 sessions, the same as the planner
    assert client.get("/api/plan").json()["plan"]["unscheduled"] >= 0
    client.delete("/api/plan")
    assert len(client.get("/api/today").json()["plan"]) <= 3


def test_overloaded_gemini_gives_a_friendly_message_not_the_raw_error(monkeypatch):
    from app.ai.gemini import BUSY_MESSAGE, PHOTO_BUSY_MESSAGE, llm_json, read_image
    from app.errors import LLMError
    monkeypatch.setattr(gemini, "RETRY_PAUSE_SECONDS", 0)
    monkeypatch.setattr(gemini, "call_llm_json", lambda *a, **k: {"success": False, "error": "503 UNAVAILABLE. {'error': {'code': 503}}"})
    with pytest.raises(LLMError) as err:
        llm_json("s", "p")
    assert str(err.value) == BUSY_MESSAGE and "503" not in str(err.value)

    attempts = []

    class Busy:
        class models:
            @staticmethod
            def generate_content(**kw):
                attempts.append(1)
                raise RuntimeError("503 UNAVAILABLE. {'error': {'message': 'high demand'}}")

    monkeypatch.setattr(gemini, "_get_client", lambda: Busy)
    with pytest.raises(LLMError) as err:
        read_image(b"x", "image/jpeg")
    assert str(err.value) == PHOTO_BUSY_MESSAGE and len(attempts) == gemini.ATTEMPTS   # retried, then a plain message


def test_typed_answers_land_after_the_open_tutor_bubble_and_marker_only_turns_are_dropped(monkeypatch):
    # Eklavya is mid-sentence when the student types: the tutor bubble is closed first, then the typed turn is shown,
    # then the reply: log order = tutor, you, tutor. A marker-only turn closes with an empty final (the browser drops it).
    script = [[sc(output_transcription=NS(text="What is precision?")), sc(turn_complete=False)],
              [sc(output_transcription=NS(text="<no ")), sc(output_transcription=NS(text="speech>")), sc(turn_complete=True)]]
    fake = FakeSession(script)
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect("/ws/voice") as ws:
        ev, _ = collect(ws, until="turn_complete")
    shown = [(e["role"], e["text"], e["final"]) for e in ev if e["type"] == "transcript"]
    assert all("<no" not in text and "speech>" not in text for _, text, _ in shown)
    assert ("tutor", "What is precision?", False) in shown


def test_a_crowded_exam_plan_never_exceeds_the_daily_minutes():
    topics = [{"topic_id": i, "topic_name": f"T{i}", "mastery": 20 + i} for i in range(12)]   # far more work than fits
    plan = build_plan(topics, TODAY, TODAY + timedelta(days=5), minutes_per_day=30)
    assert all(sum(i["minutes"] for i in d["items"]) <= 30 for d in plan["days"])   # the minutes, not just the count
    assert plan["unscheduled"] > 0 and all(i["topic_id"] < 12 for d in plan["days"] for i in d["items"])


def test_every_persona_keeps_one_language_and_never_assumes_gender():
    from app.ai.live import build_system_prompt
    topics = [{"id": 1, "topic_name": "Precision", "document_id": 1}]
    focus = topics[0]
    prompts = {
        "tutor": build_system_prompt("hinglish", topics, "learn", focus),
        "examiner": build_system_prompt("hinglish", topics, "viva", focus),
        "debater": build_system_prompt("hinglish", topics, "debate", focus, {"side": "for", "motion": "", "style": "tough"}),
    }
    for name, text in prompts.items():
        assert "WHOLE session" in text and "Never assume the student's gender" in text, name
        assert "karoge/karogi" in text and "{{" not in text, name
    assert "answers_the_question" in prompts["examiner"] and "EXACT question" in prompts["examiner"]
    assert "false negative is a real positive that was missed" in prompts["debater"] and "Never swap them" in prompts["debater"]
    revise = build_system_prompt("hinglish", topics, "revise", focus)
    assert "session language in every turn" in revise
