"""Flashcards: GET /api/flashcards[?topic_id=], POST /api/flashcards/generate, GET /api/flashcards/due,
POST /api/flashcards/{id}/review (knew it / did not)."""
from fastapi import APIRouter

from app import auth
from fastapi.concurrency import run_in_threadpool

from app.agents import flashcards
from app.api.schemas import FlashcardReviewRequest, FlashcardsRequest
from app.services.progress_data import local_today

router = APIRouter()


@router.get("/api/flashcards")
def list_cards(user_id: int = auth.CurrentUser, topic_id: int | None = None):
    return {"cards": flashcards.cards_for(user_id, topic_id)}


@router.post("/api/flashcards/generate")
async def generate_cards(req: FlashcardsRequest, user_id: int = auth.CurrentUser):
    # calls Gemini (blocking): keep it off the event loop that also serves the voice WebSocket
    return {"cards": await run_in_threadpool(flashcards.generate, user_id, req.topic_id)}


@router.get("/api/flashcards/due")
def due(user_id: int = auth.CurrentUser):
    return {"cards": flashcards.due_cards(user_id, local_today())}


@router.post("/api/flashcards/{card_id}/review")
def review(card_id: int, req: FlashcardReviewRequest, user_id: int = auth.CurrentUser):
    return flashcards.review(user_id, card_id, req.knew, local_today())
