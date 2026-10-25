"""POST /api/missions/generate."""
from fastapi import APIRouter

from app.agents import study_mission
from app.api.schemas import MissionRequest

router = APIRouter()


@router.post("/api/missions/generate")
def missions_generate(req: MissionRequest):
    return study_mission.generate(req.user_id)
