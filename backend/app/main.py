"""FastAPI application factory.

Run from ``backend/``:  ``uvicorn main:app --port 5000``  (or ``python main.py``).
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.api import router as api_router
from app.config import settings
from app.errors import register_error_handlers


def create_app() -> FastAPI:
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    db.init_db()

    app = FastAPI(title="Eklavya API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(api_router)

    @app.get("/")
    def root():
        return {"status": "ok", "service": "Eklavya API"}

    return app


app = create_app()
