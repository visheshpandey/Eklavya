"""WS /ws/voice?user_id=1&lang=hinglish[&mode=learn|test|debate&topic_id=N&side=for|against&motion=...]: live voice tutor over Gemini Live.

mode=learn  teach the chosen topic step by step (from its own notes), then run a short voice test
mode=test   voice test on the chosen topic only
mode=debate the student debates the tutor about the chosen topic; side=for|against is the side the TUTOR argues,
            motion is optional free text (up to 200 characters; otherwise the tutor picks one)
(default)   open conversation across all of the student's notes
"""
import asyncio

from fastapi import APIRouter, WebSocket

from app import db
from app.agents import quiz
from app.ai import live
from app.config import settings

router = APIRouter()
MAX_MOTION_CHARS = 200


@router.websocket("/ws/voice")
async def voice(ws: WebSocket, user_id: int = settings.demo_user_id, lang: str = "hinglish", mode: str = "free", topic_id: int = None,
                side: str = "for", motion: str = ""):
    await ws.accept()
    topics = db.query(
        "SELECT t.id, t.topic_name, t.document_id FROM topics t JOIN documents d ON d.id = t.document_id "
        "WHERE d.user_id = ? ORDER BY d.id DESC, t.id", (user_id,))
    if not topics:
        await ws.send_json({"type": "error", "message": "Upload your notes first, then start the voice session."})
        await ws.close()
        return
    focus = next((t for t in topics if t["id"] == topic_id), None)
    if mode in ("learn", "test", "debate") and not focus:
        await ws.send_json({"type": "error", "message": "Pick a topic from your notes first."})
        await ws.close()
        return
    debate = {"side": "against" if side == "against" else "for", "motion": " ".join(motion.split())[:MAX_MOTION_CHARS]} if mode == "debate" else None
    if focus and mode != "debate":   # write the test questions while the lesson runs, so the test starts without a pause
        prefetch = asyncio.create_task(asyncio.to_thread(quiz.warm_up, focus["id"]))   # noqa: F841 - kept referenced until done
    session = live.LiveTutorSession(ws, user_id, lang.lower(), focus["document_id"] if focus else None, topics,
                                    connect=live.default_connect, mode=mode if focus else "free", focus_topic=focus, debate=debate)
    await session.run()
    try:
        await ws.close()
    except Exception:  # noqa: BLE001 - already closed by the client
        pass
