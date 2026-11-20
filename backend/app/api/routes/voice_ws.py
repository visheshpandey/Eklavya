"""WS /ws/voice?lang=hinglish[&token=<login token>&mode=...&topic_id=N&side=for|against&motion=...&style=tough|friendly]:
live voice tutor over Gemini Live.

mode=learn   teach the chosen topic step by step (from its own notes), then run a short voice test
mode=test    voice test on the chosen topic only
mode=revise  5-minute spaced revision: one recap board, then a 2-question check
mode=viva    oral exam by the examiner persona: 5 questions with probing, marks out of 10, report card
mode=debate  the student debates the tutor about the chosen topic; side=for|against is the side the TUTOR argues,
             motion is optional free text (up to 200 characters; otherwise the tutor picks one),
             style=tough|friendly sets how hard the tutor pushes
tutor=mentor|senior   the tutor's personality and voice (calm mentor, friendly senior)
(default)    open conversation across all of the student's notes
standby=1    pre-connect: the socket opens at once and answers {"type": "standby"}, then waits (up to 10 minutes) for
             {"type": "start", lang, mode, topic_id, side, motion, style, tutor, resume}; those values replace the ones in the URL.
             The page opens it when the Study room opens, so the connection is ready when the student picks a mode. No microphone,
             no Gemini session and no voice minutes are used until "start" arrives.
"""
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app import auth, db
from app.agents import quiz
from app.ai import live
from app.api.limits import caller
from app.errors import RateLimitedError
from app.services import rate_limit, voice_limit

router = APIRouter()
MAX_MOTION_CHARS = 200
STANDBY_SECONDS = 600


async def _wait_for_start(ws: WebSocket):
    """The `start` message of a standby socket (pings from the page are ignored), or None if the page left or never started."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + STANDBY_SECONDS
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            return None
        try:
            message = await asyncio.wait_for(ws.receive_json(), remaining)
        except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError, ValueError):
            return None
        if isinstance(message, dict) and message.get("type") == "start":
            return message


@router.websocket("/ws/voice")
async def voice(ws: WebSocket, user_id: int = auth.CurrentUser, lang: str = "hinglish", mode: str = "free", topic_id: int = None,
                side: str = "for", motion: str = "", style: str = "tough", tutor: str = "mentor", resume: str = "", standby: int = 0):
    await ws.accept()
    if await asyncio.to_thread(voice_limit.reached, user_id):
        await ws.send_json({"type": "error", "code": "daily_limit", "retryable": False, "message": live.ERROR_MESSAGES["daily_limit"]})
        await ws.close()
        return
    if standby:   # pre-connected: ready now, and the real settings arrive with "start"
        await ws.send_json({"type": "standby"})
        start = await _wait_for_start(ws)
        if start is None:
            try:
                await ws.close()
            except Exception:  # noqa: BLE001 - already closed by the page
                pass
            return
        lang, mode, tutor, resume = str(start.get("lang", lang)), str(start.get("mode", mode)), str(start.get("tutor", tutor)), str(start.get("resume", "") or "")
        side, motion, style = str(start.get("side", side)), str(start.get("motion", motion) or ""), str(start.get("style", style))
        try:
            topic_id = int(start["topic_id"]) if start.get("topic_id") else None
        except (TypeError, ValueError):
            topic_id = None
        if await asyncio.to_thread(voice_limit.reached, user_id):   # the minutes may have run out while it waited
            await ws.send_json({"type": "error", "code": "daily_limit", "retryable": False, "message": live.ERROR_MESSAGES["daily_limit"]})
            await ws.close()
            return
    try:   # starting a session spends Gemini quota: the same per-minute limit as Ask (a pre-connected socket counts when it really starts)
        rate_limit.check("voice", caller(ws, user_id))
    except RateLimitedError as exc:
        await ws.send_json({"type": "error", "code": "rate_limited", "retryable": False, "message": str(exc)})
        await ws.close()
        return
    topics = await asyncio.to_thread(      # the event loop also answers every voice socket's pings: never wait on the database here
        db.query, "SELECT t.id, t.topic_name, t.document_id FROM topics t JOIN documents d ON d.id = t.document_id "
        "WHERE d.user_id = ? ORDER BY d.id DESC, t.id", (user_id,))
    if not topics and mode != "free":   # a plain conversation needs no notes; lessons, tests, vivas and debates do
        await ws.send_json({"type": "error", "code": "need_notes", "retryable": False, "message": live.ERROR_MESSAGES["need_notes"]})
        await ws.close()
        return
    focus = next((t for t in topics if t["id"] == topic_id), None)
    if mode in live.FOCUSED_MODES and not focus:
        await ws.send_json({"type": "error", "code": "need_topic", "retryable": False, "message": live.ERROR_MESSAGES["need_topic"]})
        await ws.close()
        return
    debate = {"side": "against" if side == "against" else "for", "motion": " ".join(motion.split())[:MAX_MOTION_CHARS],
              "style": style if style in live.DEBATE_STYLES else "tough"} if mode == "debate" else None
    if focus and mode in ("learn", "test", "revise"):   # write the test questions while the lesson runs, so the test starts without a pause
        prefetch = asyncio.create_task(asyncio.to_thread(quiz.warm_up, focus["id"]))   # noqa: F841 - kept referenced until done
    session = live.LiveTutorSession(ws, user_id, lang.lower(), focus["document_id"] if focus else None, topics,
                                    connect=live.default_connect, mode=mode if focus else "free", focus_topic=focus, debate=debate, tutor=tutor)
    saved = live.take_resume(resume, user_id)
    if saved:   # the browser's connection dropped and it is back: carry on where the call was
        session.restore(saved)
    await session.run()
    try:
        await ws.close()
    except Exception:  # noqa: BLE001 - already closed by the client
        pass
