"""HTTP/WebSocket layer. Handlers stay thin: validate input, call an agent or service, return the result."""
from fastapi import APIRouter

from app.api.routes import auth, dashboard, demo, documents, flashcards, missions, plan, quiz, today, topics, tutor, voice_ws

router = APIRouter()
for _module in (auth, documents, tutor, quiz, missions, dashboard, topics, demo, today, plan, flashcards, voice_ws):
    router.include_router(_module.router)
