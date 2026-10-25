"""WS /ws/voice?user_id=1&lang=hinglish[&mode=learn|test&topic_id=N]: live voice tutor over Gemini Live.

mode=learn  teach the chosen topic step by step, then run a short voice test
mode=test   voice test on the chosen topic only
(default)   open conversation
"""
from fastapi import APIRouter, WebSocket

import db
import live
import retrieval

router = APIRouter()


@router.websocket("/ws/voice")
async def voice(ws: WebSocket, user_id: int = 1, lang: str = "hinglish", mode: str = "free", topic_id: int = None):
    await ws.accept()
    doc_id = retrieval.latest_document_id(user_id)
    if not doc_id:
        await ws.send_json({"type": "error", "message": "Upload your notes first, then start the voice session."})
        await ws.close()
        return
    topics = db.query("SELECT id, topic_name FROM topics WHERE document_id = ? ORDER BY id", (doc_id,))
    focus = next((t for t in topics if t["id"] == topic_id), None)
    if mode in ("learn", "test") and not focus:
        await ws.send_json({"type": "error", "message": "Pick a topic from your notes first."})
        await ws.close()
        return
    session = live.LiveTutorSession(ws, user_id, lang.lower(), doc_id, topics, connect=live.default_connect,
                                    mode=mode if focus else "free", focus_topic=focus)
    await session.run()
    try:
        await ws.close()
    except Exception:  # noqa: BLE001 - already closed by the client
        pass
