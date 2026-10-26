"""Tools the live Gemini tutor can call, plus the dispatcher.

Each tool runs server-side against P2's modules (retrieval, quiz, evaluation, study_mission, db),
logs to agent_logs, and pushes a UI event through ctx.emit so the frontend can react
(emotion chip, quiz card, mastery animation, mission card, whiteboard).
"""
import asyncio
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Awaitable, Callable, Optional

from google.genai import types

from app import db
from app.agents import evaluation, quiz, study_mission
from app.agents.logger import log_agent
from app.domain import board as boards, scoring
from app.domain.mastery import update_mastery
from app.services import search

S = types.Schema
T = types.Type
VIVA_ANSWER_SECONDS = 90     # the on-screen answer timer for each viva question

TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="search_notes",
        description="Search the student's uploaded notes. Call this before explaining anything from their subject.",
        parameters=S(type=T.OBJECT, properties={
            "query": S(type=T.STRING, description="Short English keywords for what the student asked about, e.g. 'precision definition example'."),
        }, required=["query"])),
    types.FunctionDeclaration(
        name="report_learner_state",
        description="Silently record how the student sounds and feels this turn. Never mention this to the student.",
        parameters=S(type=T.OBJECT, properties={
            "topic": S(type=T.STRING, description="Topic being discussed, as named in the notes."),
            "confusion": S(type=T.NUMBER, description="0 (clear) to 1 (very confused)."),
            "confidence": S(type=T.NUMBER, description="0 (hesitant, unsure) to 1 (sure and fluent)."),
            "frustration": S(type=T.NUMBER, description="0 (calm) to 1 (frustrated or discouraged)."),
            "note": S(type=T.STRING, description="One short sentence on why."),
        }, required=["topic", "confusion", "confidence", "frustration"])),
    types.FunctionDeclaration(
        name="ask_quiz_question",
        description="Get the next multiple-choice question to ask aloud. Read the question and all four options to the student.",
        parameters=S(type=T.OBJECT, properties={
            "topic": S(type=T.STRING, description="Optional topic name. Omit to use the student's weakest topic."),
        })),
    types.FunctionDeclaration(
        name="grade_answer",
        description="Grade the student's spoken answer to the current quiz question. Always use this; never judge correctness yourself.",
        parameters=S(type=T.OBJECT, properties={
            "student_answer": S(type=T.STRING, description="Exactly what the student said, e.g. 'B' or 'option c' or the option text."),
            "confidence": S(type=T.NUMBER, description="Optional 0-1 confidence in their answer based on how it sounded."),
        }, required=["student_answer"])),
    types.FunctionDeclaration(
        name="show_board",
        description=("Put what you are explaining on the student's whiteboard while you say it: a formula, numbered steps, "
                     "or a small table. Content must come from search_notes results. Call it again with the same title and a "
                     "new highlight to move through steps."),
        parameters=S(type=T.OBJECT, properties={
            "kind": S(type=T.STRING, enum=list(boards.KINDS), description="formula, steps or table."),
            "title": S(type=T.STRING, description="Short heading, e.g. 'Precision'."),
            "formula": S(type=T.STRING, description="formula only: e.g. 'Precision = TP / (TP + FP)'."),
            "items": S(type=T.ARRAY, items=S(type=T.STRING),
                       description="steps: the steps in order. formula: optional 'where' lines, e.g. 'TP = spam correctly caught'."),
            "result": S(type=T.STRING, description="formula only, optional: a worked example, e.g. '8 / (8 + 2) = 0.8'."),
            "highlight": S(type=T.INTEGER, description="steps only, optional: the step number you are on now (1-based)."),
            "headers": S(type=T.ARRAY, items=S(type=T.STRING), description="table only: column headings."),
            "rows": S(type=T.ARRAY, items=S(type=T.STRING), description="table only: one string per row, cells separated by |."),
        }, required=["kind", "title"])),
    types.FunctionDeclaration(
        name="get_mission",
        description="Get the student's current study mission to tell them what to do next.",
        parameters=S(type=T.OBJECT, properties={})),
]

VIVA_DECLARATIONS = [
    types.FunctionDeclaration(
        name="ask_viva_question",
        description="Put your next viva question on the student's screen (it starts their answer timer). Call it as you ask the question aloud.",
        parameters=S(type=T.OBJECT, properties={
            "question": S(type=T.STRING, description="The question exactly as you ask it, one sentence."),
        }, required=["question"])),
    types.FunctionDeclaration(
        name="mark_viva_answer",
        description="Mark the student's answer to the current viva question, after any follow-up probing.",
        parameters=S(type=T.OBJECT, properties={
            "mark": S(type=T.NUMBER, description="0, 0.5, 1, 1.5 or 2. 2 = complete and correct; 1 = partly right; 0 = wrong or no answer."),
            "feedback": S(type=T.STRING, description="One sentence for the student: what was good or missing."),
            "answer_summary": S(type=T.STRING, description="What the student said, in a few words."),
        }, required=["mark", "feedback"])),
    types.FunctionDeclaration(
        name="finish_viva",
        description="Finish the viva after the last mark: saves the report card and shows it on screen.",
        parameters=S(type=T.OBJECT, properties={
            "strengths": S(type=T.STRING, description="One or two sentences: what the student did well."),
            "improve": S(type=T.STRING, description="One or two sentences: the most useful thing to work on."),
        }, required=["strengths", "improve"])),
]

DEBATE_DECLARATIONS = [
    types.FunctionDeclaration(
        name="score_argument",
        description="Silently score the student's last argument (0-10 each) right after they make it. Never read the scores out.",
        parameters=S(type=T.OBJECT, properties={
            "evidence": S(type=T.NUMBER, description="0-10: used facts, numbers or examples (from the notes or real life)."),
            "logic": S(type=T.NUMBER, description="0-10: the reasoning holds together and answers the motion."),
            "rebuttal": S(type=T.NUMBER, description="0-10: dealt with your previous point instead of ignoring it."),
            "note": S(type=T.STRING, description="A few words on the strongest or weakest part, shown to the student."),
        }, required=["evidence", "logic", "rebuttal"])),
    types.FunctionDeclaration(
        name="finish_debate",
        description="After the closing statements and before you speak the verdict: record the result and show the verdict card.",
        parameters=S(type=T.OBJECT, properties={
            "student_score": S(type=T.NUMBER, description="0-10: how convincingly the student argued overall."),
            "eklavya_score": S(type=T.NUMBER, description="0-10: how convincingly you argued overall. Be honest."),
            "strength": S(type=T.STRING, description="One sentence: the student's best moment."),
            "improve": S(type=T.STRING, description="One sentence: the one thing that would have made their case stronger."),
        }, required=["student_score", "eklavya_score", "strength", "improve"])),
]

_COMMON = {"search_notes", "report_learner_state", "show_board"}
_BY_NAME = {d.name: d for d in TOOL_DECLARATIONS + VIVA_DECLARATIONS + DEBATE_DECLARATIONS}


def declarations_for(mode: str):
    """The tools the model gets in each mode: quiz tools for lessons and tests, marking tools for a viva,
    scoring tools for a debate (so it cannot, say, start a quiz in the middle of a debate)."""
    if mode == "viva":
        names = _COMMON | {d.name for d in VIVA_DECLARATIONS}
    elif mode == "debate":
        names = _COMMON | {d.name for d in DEBATE_DECLARATIONS}
    else:
        names = {d.name for d in TOOL_DECLARATIONS}
    return [d for name, d in _BY_NAME.items() if name in names]


def tools_for(mode: str):
    return [types.Tool(function_declarations=declarations_for(mode))]


TOOLS = tools_for("free")


@dataclass
class ToolContext:
    user_id: int
    document_id: Optional[int]   # when set, note search is limited to this document (the focused topic's); None = all notes
    emit: Callable[[dict], Awaitable[None]]
    current_question_id: Optional[int] = None
    topics: list = field(default_factory=list)  # [{id, topic_name}]
    focus_topic_id: Optional[int] = None         # set when the student picked a topic to learn / be tested on
    mode: str = "free"                           # free | learn | test | revise | viva | debate
    test_total: int = 3                          # questions in a focused test
    asked_ids: list = field(default_factory=list)
    results: list = field(default_factory=list)  # one dict per graded answer this session
    viva_id: Optional[int] = None                # viva: the row in `vivas`, created with the first question
    viva_question: Optional[str] = None          # viva: the question waiting for a mark
    viva_answers: list = field(default_factory=list)   # viva: [{question, mark, feedback}]
    debate: Optional[dict] = None                # debate: {"side", "motion", "style"}
    debate_id: Optional[int] = None
    debate_rounds: list = field(default_factory=list)  # debate: one argument_score dict per student argument

    def topic_id_for(self, name: Optional[str]) -> Optional[int]:
        """Best fuzzy match of a spoken/LLM topic name to a topic id."""
        if not name or not self.topics:
            return None
        best, score = None, 0.0
        for t in self.topics:
            r = SequenceMatcher(None, name.lower(), t["topic_name"].lower()).ratio()
            if name.lower() in t["topic_name"].lower() or t["topic_name"].lower() in name.lower():
                r = max(r, 0.9)
            if r > score:
                best, score = t["id"], r
        return best if score >= 0.6 else None


def _num(v, default=0.5):
    try:
        return min(max(float(v), 0.0), 1.0)
    except (TypeError, ValueError):
        return default


async def search_notes(ctx: ToolContext, query: str = "", **_):
    hits = await asyncio.to_thread(search.search, ctx.user_id, query, ctx.document_id)
    log_agent(ctx.user_id, "voice_tutor", f"search_notes('{query}')",
              f"{len(hits)} chunks" + (f", best: {hits[0]['topic']} ({hits[0]['score']})" if hits else ""),
              "Grounded the answer in notes" if hits else "Nothing found in notes", 0.8 if hits else 0.3)
    if not hits:
        return {"found": False, "message": "Nothing about this in the student's notes."}
    return {"found": True, "results": [
        {"document": h["document"], "topic": h["topic"], "section": h["heading"], "text": h["text"]} for h in hits]}


async def report_learner_state(ctx: ToolContext, topic: str = "", confusion=0.5, confidence=0.5,
                               frustration=0.0, note: str = "", **_):
    c, f, fr = _num(confusion), _num(confidence), _num(frustration, 0.0)
    tid = ctx.topic_id_for(topic)
    await asyncio.to_thread(db.save_learner_state, ctx.user_id, tid, c, f, fr, note)
    log_agent(ctx.user_id, "learner_profile", f"Tone on '{topic}': confusion {c:.2f}, confidence {f:.2f}, frustration {fr:.2f}",
              note or "Updated learner state", "Tutor adapts pace and tone", f)
    await ctx.emit({"type": "emotion", "topic": topic, "confusion": c, "confidence": f, "frustration": fr, "note": note})
    return {"ok": True}


async def ask_quiz_question(ctx: ToolContext, topic: str = None, **_):
    focused = ctx.focus_topic_id is not None
    if focused and len(ctx.results) >= ctx.test_total:
        return {"available": False, "test_complete": True,
                "message": "The test is finished. Give the spoken summary now, then call get_mission."}
    tid = ctx.focus_topic_id if focused else (ctx.topic_id_for(topic) if topic else None)
    q = await asyncio.to_thread(quiz.next_question, ctx.user_id, tid, ctx.asked_ids)
    if not q:
        return {"available": False, "test_complete": focused,
                "message": "No more questions on this topic." + (" Give the spoken summary now." if focused else "")}
    ctx.asked_ids.append(q["question_id"])
    ctx.current_question_id = q["question_id"]
    number = len(ctx.asked_ids)
    if focused:
        if number == 1:
            await ctx.emit({"type": "phase", "phase": "test", "topic": q["topic"]})
        q = {**q, "number": number, "total": ctx.test_total}
    await ctx.emit({"type": "quiz_question", **q})
    return {"available": True, "question": q["question"], "options": q["options"], "topic": q["topic"],
            **({"question_number": number, "of": ctx.test_total} if focused else {})}


async def grade_answer(ctx: ToolContext, student_answer: str = "", confidence=None, **_):
    if not ctx.current_question_id:
        return {"error": "No quiz question is active. Call ask_quiz_question first."}
    conf = None if confidence is None else _num(confidence)
    res = await asyncio.to_thread(evaluation.grade, ctx.user_id, ctx.current_question_id, student_answer, conf)
    if res.get("unclear"):
        return {"unclear": True, "message": res["message"]}
    ctx.results.append({"is_correct": res["is_correct"], "before": res["mastery_before"], "after": res["mastery_after"],
                        "misconception": (res["misconception"] or {}).get("text"),
                        "resolved": res["misconceptions_resolved"], "topic": res["topic"]})
    await ctx.emit({"type": "mastery", "topic": res["topic"], "before": res["mastery_before"], "after": res["mastery_after"],
                    "is_correct": res["is_correct"], "misconception": res["misconception"],
                    "misconceptions_resolved": res["misconceptions_resolved"]})
    out = {"is_correct": res["is_correct"], "correct_answer": res["correct_answer"], "explanation": res["explanation"],
           "topic": res["topic"], "mastery_before": res["mastery_before"], "mastery_after": res["mastery_after"],
           "misconceptions_resolved": res["misconceptions_resolved"]}
    if res["misconception"]:
        out["misconception"] = res["misconception"]["text"]
    if ctx.focus_topic_id is not None and len(ctx.results) >= ctx.test_total:
        r = ctx.results
        summary = {"type": "test_summary", "topic": res["topic"], "correct": sum(1 for x in r if x["is_correct"]),
                   "total": len(r), "mastery_before": r[0]["before"], "mastery_after": r[-1]["after"],
                   "misconceptions": [x["misconception"] for x in r if x["misconception"]],
                   "resolved": sum(x["resolved"] for x in r)}
        await ctx.emit({"type": "phase", "phase": "summary", "topic": res["topic"]})
        await ctx.emit(summary)
        out["test_complete"] = True
        out["instruction"] = ("That was the last question. Now give a short warm spoken summary (what went well, the "
                              "misconception found, how mastery moved), then call get_mission.")
    return out


async def get_mission(ctx: ToolContext, **_):
    m = await asyncio.to_thread(study_mission.current, ctx.user_id)
    await ctx.emit({"type": "mission", "title": m["mission_title"], "duration_minutes": m["duration_minutes"],
                    "priority": m["priority"], "reason": m["reason"], "tasks": m["tasks"]})
    return {"title": m["mission_title"], "minutes": m["duration_minutes"], "priority": m["priority"],
            "reason": m["reason"], "tasks": m["tasks"]}


async def show_board(ctx: ToolContext, **args):
    try:
        card = boards.clean_board(args)
    except ValueError as e:
        return {"shown": False, "error": str(e)}
    await ctx.emit({"type": "board", **card})
    return {"shown": True}


def _topic_name(topic_id: Optional[int]) -> str:
    row = db.one("SELECT topic_name FROM topics WHERE id = ?", (topic_id,)) if topic_id else None
    return row["topic_name"] if row else ""


def _line(text, limit: int) -> str:
    return " ".join(str(text or "").split())[:limit]


async def ask_viva_question(ctx: ToolContext, question: str = "", **_):
    if len(ctx.viva_answers) >= scoring.VIVA_QUESTIONS:
        return {"viva_complete": True, "message": "All questions are marked. Call finish_viva now."}
    question = _line(question, 300)
    if not question:
        return {"error": "question is required"}
    if ctx.viva_id is None:
        ctx.viva_id = await asyncio.to_thread(db.execute, "INSERT INTO vivas (user_id, topic_id) VALUES (?, ?)",
                                              (ctx.user_id, ctx.focus_topic_id))
    ctx.viva_question = question
    number = len(ctx.viva_answers) + 1
    await ctx.emit({"type": "viva_question", "number": number, "total": scoring.VIVA_QUESTIONS, "question": question,
                    "seconds": VIVA_ANSWER_SECONDS, "topic": _topic_name(ctx.focus_topic_id)})
    return {"shown": True, "question_number": number, "of": scoring.VIVA_QUESTIONS}


def _record_viva_answer(ctx: ToolContext, question: str, mark: float, feedback: str, summary: str):
    """Save the answer and move mastery the same way a quiz answer does (half marks or more counts as right).
    It also goes into quiz_attempts, so the progress chart and history show viva answers too."""
    db.execute("INSERT INTO viva_answers (viva_id, question, answer_summary, mark, feedback) VALUES (?, ?, ?, ?, ?)",
               (ctx.viva_id, question, summary, mark, feedback))
    topic_id = ctx.focus_topic_id
    row = db.one("SELECT mastery_score FROM learner_mastery WHERE user_id = ? AND topic_id = ?", (ctx.user_id, topic_id))
    before = row["mastery_score"] if row else 50.0
    correct = scoring.viva_counts_as_correct(mark)
    after = update_mastery(before, correct, 0.5)
    db.execute("INSERT INTO learner_mastery (user_id, topic_id, mastery_score) VALUES (?, ?, ?) "
               "ON CONFLICT(user_id, topic_id) DO UPDATE SET mastery_score = excluded.mastery_score, "
               "last_updated = CURRENT_TIMESTAMP", (ctx.user_id, topic_id, after))
    db.execute("INSERT INTO quiz_attempts (user_id, topic_id, question_id, question, student_answer, is_correct, confidence,"
               " mastery_before, mastery_after) VALUES (?, ?, NULL, ?, ?, ?, 0.5, ?, ?)",
               (ctx.user_id, topic_id, f"Viva: {question}", summary, int(correct), before, after))
    log_agent(ctx.user_id, "examiner", f"Viva answer on {_topic_name(topic_id)}: {summary or 'spoken answer'}",
              f"Marked {mark}/{scoring.VIVA_MAX_PER_QUESTION}: {feedback}", f"Mastery {before} -> {after}", 0.7)
    return before, after


async def mark_viva_answer(ctx: ToolContext, mark=0, feedback: str = "", answer_summary: str = "", **_):
    if not ctx.viva_question or ctx.viva_id is None:
        return {"error": "No viva question is waiting for a mark. Call ask_viva_question first."}
    if ctx.focus_topic_id is None:
        return {"error": "A viva needs a topic."}
    value = scoring.viva_mark(mark)
    feedback, summary = _line(feedback, 300), _line(answer_summary, 300)
    question, ctx.viva_question = ctx.viva_question, None
    before, after = await asyncio.to_thread(_record_viva_answer, ctx, question, value, feedback, summary)
    ctx.viva_answers.append({"question": question, "mark": value, "feedback": feedback})
    number = len(ctx.viva_answers)
    await ctx.emit({"type": "viva_mark", "number": number, "mark": value, "out_of": scoring.VIVA_MAX_PER_QUESTION,
                    "feedback": feedback, "mastery_before": before, "mastery_after": after})
    out = {"recorded": True, "question_number": number, "of": scoring.VIVA_QUESTIONS}
    if number >= scoring.VIVA_QUESTIONS:
        out["instruction"] = "That was the last question. Call finish_viva, then read out the result kindly."
    return out


async def finish_viva(ctx: ToolContext, strengths: str = "", improve: str = "", **_):
    if ctx.viva_id is None or not ctx.viva_answers:
        return {"error": "No viva answers to report yet."}
    total = scoring.viva_total(a["mark"] for a in ctx.viva_answers)
    strengths, improve = _line(strengths, 400), _line(improve, 400)
    await asyncio.to_thread(db.execute, "UPDATE vivas SET finished_at = CURRENT_TIMESTAMP, marks = ?, out_of = ?, "
                            "strengths = ?, improve = ? WHERE id = ?",
                            (total["marks"], total["out_of"], strengths, improve, ctx.viva_id))
    log_agent(ctx.user_id, "examiner", f"Viva on {_topic_name(ctx.focus_topic_id)} finished",
              f"{total['marks']}/{total['out_of']}", f"Report card: improve {improve}", 0.8)
    await ctx.emit({"type": "viva_report", "topic": _topic_name(ctx.focus_topic_id), **total, "strengths": strengths,
                    "improve": improve, "answers": ctx.viva_answers})
    return {"saved": True, **total}


async def _debate_row(ctx: ToolContext) -> int:
    if ctx.debate_id is None:
        debate = ctx.debate or {}
        ctx.debate_id = await asyncio.to_thread(
            db.execute, "INSERT INTO debates (user_id, topic_id, motion, tutor_side, style) VALUES (?, ?, ?, ?, ?)",
            (ctx.user_id, ctx.focus_topic_id, debate.get("motion", ""), debate.get("side", ""), debate.get("style", "")))
    return ctx.debate_id


async def score_argument(ctx: ToolContext, evidence=0, logic=0, rebuttal=0, note: str = "", **_):
    score = scoring.argument_score(evidence, logic, rebuttal)
    note = _line(note, 200)
    debate_id = await _debate_row(ctx)
    await asyncio.to_thread(db.execute, "INSERT INTO debate_rounds (debate_id, evidence, logic, rebuttal, strength, note) "
                            "VALUES (?, ?, ?, ?, ?, ?)",
                            (debate_id, score["evidence"], score["logic"], score["rebuttal"], score["strength"], note))
    ctx.debate_rounds.append(score)
    average = round(sum(r["strength"] for r in ctx.debate_rounds) / len(ctx.debate_rounds), 1)
    await ctx.emit({"type": "debate_score", "round": len(ctx.debate_rounds), **score, "note": note, "average": average})
    return {"recorded": True}


async def finish_debate(ctx: ToolContext, student_score=0, eklavya_score=0, strength: str = "", improve: str = "", **_):
    student = scoring.clamp(student_score, 0, scoring.DEBATE_MAX, 0)
    tutor = scoring.clamp(eklavya_score, 0, scoring.DEBATE_MAX, 0)
    winner = scoring.debate_winner(student, tutor)
    strength, improve = _line(strength, 300), _line(improve, 300)
    debate_id = await _debate_row(ctx)
    await asyncio.to_thread(db.execute, "UPDATE debates SET finished_at = CURRENT_TIMESTAMP, winner = ?, student_score = ?, "
                            "tutor_score = ?, strength = ?, improve = ? WHERE id = ?",
                            (winner, student, tutor, strength, improve, debate_id))
    log_agent(ctx.user_id, "debater", f"Debate on {_topic_name(ctx.focus_topic_id)} finished after {len(ctx.debate_rounds)} arguments",
              f"Winner: {winner} ({student} vs {tutor})", f"Verdict card: improve {improve}", 0.8)
    await ctx.emit({"type": "debate_verdict", "winner": winner, "student_score": student, "eklavya_score": tutor,
                    "strength": strength, "improve": improve, "rounds": len(ctx.debate_rounds)})
    return {"saved": True, "winner": winner}


HANDLERS = {
    "search_notes": search_notes, "report_learner_state": report_learner_state,
    "ask_quiz_question": ask_quiz_question, "grade_answer": grade_answer, "get_mission": get_mission,
    "show_board": show_board,
    "ask_viva_question": ask_viva_question, "mark_viva_answer": mark_viva_answer, "finish_viva": finish_viva,
    "score_argument": score_argument, "finish_debate": finish_debate,
}


async def dispatch(ctx: ToolContext, name: str, args: dict) -> dict:
    """Run one tool call. Errors are returned to the model as {"error": ...}, never raised, so the
    voice session keeps going (no invented content: the model is told the tool failed)."""
    handler = HANDLERS.get(name)
    if not handler:
        return {"error": f"Unknown tool {name}"}
    try:
        return await handler(ctx, **(args or {}))
    except Exception as e:  # noqa: BLE001 - surface to the model, keep the call alive
        log_agent(ctx.user_id, "voice_tutor", f"Tool {name} failed", str(e)[:200], "Told the model the tool failed", 0.0)
        return {"error": f"{name} failed: {e}"}
