"""Entry point kept for ``uvicorn main:app`` and ``python main.py``.

Host, port and reload come from ``backend/.env`` (HOST, PORT, RELOAD), see ``app/config.py``.
"""
from app.main import app  # noqa: F401  (re-exported for uvicorn)

if __name__ == "__main__":
    import uvicorn

    from app.config import settings

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload)
