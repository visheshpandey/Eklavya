"""WS /ws/voice?user_id=1&lang=hinglish: live voice tutor over Gemini Live."""
from fastapi import APIRouter, WebSocket

import db
import live
import retrieval

router = APIRouter()


@router.websocket("/ws/voice")
async def voice(ws: WebSocket, user_id: int = 1, lang: str = "hinglish"):
    await ws.accept()
    doc_id = retrieval.latest_document_id(user_id)
    if not doc_id:
        await ws.send_json({"type": "error", "message": "Upload your notes first, then start the voice session."})
        await ws.close()
        return
    topics = db.query("SELECT id, topic_name FROM topics WHERE document_id = ? ORDER BY id", (doc_id,))
    session = live.LiveTutorSession(ws, user_id, lang.lower(), doc_id, topics, connect=live.default_connect)
    await session.run()
    try:
        await ws.close()
    except Exception:  # noqa: BLE001 - already closed by the client
        pass
