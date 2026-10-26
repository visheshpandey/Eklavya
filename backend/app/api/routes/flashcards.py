"""Flashcards: GET /api/flashcards[?topic_id=], POST /api/flashcards/generate."""
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app.agents import flashcards
from app.api.schemas import FlashcardsRequest
from app.config import settings

router = APIRouter()


@router.get("/api/flashcards")
def list_cards(user_id: int = settings.demo_user_id, topic_id: int | None = None):
    return {"cards": flashcards.cards_for(user_id, topic_id)}


@router.post("/api/flashcards/generate")
async def generate_cards(req: FlashcardsRequest):
    # calls Gemini (blocking): keep it off the event loop that also serves the voice WebSocket
    return {"cards": await run_in_threadpool(flashcards.generate, req.user_id, req.topic_id)}
