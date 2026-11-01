"""GET /api/badges: achievements earned and still to earn."""
from fastapi import APIRouter

from app import auth
from app.services import badges

router = APIRouter()


@router.get("/api/badges")
def get_badges(user_id: int = auth.CurrentUser):
    return badges.badges(user_id)
