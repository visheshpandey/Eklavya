"""Entry point kept for ``uvicorn main:app`` and ``python main.py``.

Host, port and reload come from ``backend/.env`` (HOST, PORT, RELOAD), see ``app/config.py``.
"""
from app.main import app  # noqa: F401  (re-exported for uvicorn)

if __name__ == "__main__":
    import uvicorn

    from app.config import settings

    # Voice sockets are pinged every 20 s and given 60 s to answer (the default is 20): a busy or throttled host can be slow
    # to answer for a moment without the call being dropped with 1011 "keepalive ping timeout". Per-message compression is off:
    # it burns event-loop CPU on every audio frame and raw speech does not compress.
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload,
                ws_ping_interval=20, ws_ping_timeout=60, ws_per_message_deflate=False)
