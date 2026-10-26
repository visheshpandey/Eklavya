"""GET /api/today (home screen) and GET /api/history (finished vivas and debates)."""
from fastapi import APIRouter

from app.config import settings
from app.services.history import history
from app.services.today import today

router = APIRouter()


@router.get("/api/today")
def get_today(user_id: int = settings.demo_user_id):
    return today(user_id)


@router.get("/api/history")
def get_history(user_id: int = settings.demo_user_id):
    return history(user_id)
