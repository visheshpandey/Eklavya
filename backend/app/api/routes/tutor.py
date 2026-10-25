"""POST /api/tutor/ask: grounded text answer (the typed counterpart of the voice tutor)."""
from fastapi import APIRouter

from app.agents import voice_tutor
from app.api.schemas import TutorAskRequest

router = APIRouter()


@router.post("/api/tutor/ask")
def tutor_ask(req: TutorAskRequest):
    return voice_tutor.ask(req.user_id, req.question, req.language, req.document_id)
