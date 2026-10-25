"""Tools the live Gemini tutor can call, plus the dispatcher.

Each tool runs server-side against P2's modules (retrieval, quiz, evaluation, study_mission, db),
logs to agent_logs, and pushes a UI event through ctx.emit so the frontend can react
(emotion chip, quiz card, mastery animation, mission card).
"""
import asyncio
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Awaitable, Callable, Optional

from google.genai import types

from app import db
from app.agents import evaluation, quiz, study_mission
from app.agents.logger import log_agent
from app.domain import retrieval

S = types.Schema
T = types.Type

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
        name="get_mission",
        description="Get the student's current study mission to tell them what to do next.",
        parameters=S(type=T.OBJECT, properties={})),
]

TOOLS = [types.Tool(function_declarations=TOOL_DECLARATIONS)]


@dataclass
class ToolContext:
    user_id: int
    document_id: Optional[int]   # when set, note search is limited to this document (the focused topic's); None = all notes
    emit: Callable[[dict], Awaitable[None]]
    current_question_id: Optional[int] = None
    topics: list = field(default_factory=list)  # [{id, topic_name}]
    focus_topic_id: Optional[int] = None         # set when the student picked a topic to learn / be tested on
    mode: str = "free"                           # free | learn | test
    test_total: int = 3                          # questions in a focused test
    asked_ids: list = field(default_factory=list)
    results: list = field(default_factory=list)  # one dict per graded answer this session

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
    if ctx.document_id:
        hits = await asyncio.to_thread(retrieval.retrieve, ctx.document_id, query)
    else:
        hits = await asyncio.to_thread(retrieval.retrieve_for_user, ctx.user_id, query)
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


HANDLERS = {
    "search_notes": search_notes, "report_learner_state": report_learner_state,
    "ask_quiz_question": ask_quiz_question, "grade_answer": grade_answer, "get_mission": get_mission,
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
