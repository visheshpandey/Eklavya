"""POST /api/missions/generate"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from agents import study_mission
from schemas import MissionRequest

router = APIRouter()


@router.post("/api/missions/generate")
def missions_generate(req: MissionRequest):
    try:
        return study_mission.generate(req.user_id)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
