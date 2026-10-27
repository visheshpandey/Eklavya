"""GET /api/today (home screen), GET /api/history (finished vivas and debates), GET /api/boards (today's whiteboards)."""
from fastapi import APIRouter

from app import auth
from app.services.history import boards_today, history
from app.services.today import today

router = APIRouter()


@router.get("/api/today")
def get_today(user_id: int = auth.CurrentUser):
    return today(user_id)


@router.get("/api/history")
def get_history(user_id: int = auth.CurrentUser):
    return history(user_id)


@router.get("/api/boards")
def get_boards(user_id: int = auth.CurrentUser):
    return {"boards": boards_today(user_id)}
