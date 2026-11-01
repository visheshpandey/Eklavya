"""FastAPI application factory.

Run from ``backend/``:  ``uvicorn main:app --port 5000``  (or ``python main.py``).
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import db, lag_monitor
from app.api import router as api_router
from app.config import settings
from app.errors import register_error_handlers
from app.services.progress_data import use_timezone


@asynccontextmanager
async def lifespan(_: FastAPI):
    watcher = asyncio.create_task(lag_monitor.watch())
    try:
        yield
    finally:
        watcher.cancel()


def create_app() -> FastAPI:
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    db.init_db()

    app = FastAPI(title="Eklavya API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    @app.middleware("http")
    async def student_timezone(request: Request, call_next):
        use_timezone(request.headers.get("x-timezone"))   # "today" means the student's today, not the server's
        return await call_next(request)
    app.include_router(api_router)

    @app.get("/")
    def root():
        return {"status": "ok", "service": "Eklavya API"}

    return app


app = create_app()
