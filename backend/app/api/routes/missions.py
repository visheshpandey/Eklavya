"""POST /api/missions/generate."""
from fastapi import APIRouter

from app import auth
from app.agents import study_mission
from app.api.schemas import MissionRequest

router = APIRouter()


@router.post("/api/missions/generate")
def missions_generate(req: MissionRequest, user_id: int = auth.CurrentUser):
    return study_mission.generate(user_id)
