"""POST /api/tutor/ask  (text path)"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from agents import voice_tutor
from schemas import TutorAskRequest

router = APIRouter()


@router.post("/api/tutor/ask")
def tutor_ask(req: TutorAskRequest):
    try:
        return voice_tutor.ask(req.user_id, req.question, req.language, req.document_id)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
