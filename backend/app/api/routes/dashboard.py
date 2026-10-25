"""GET /api/dashboard."""
from fastapi import APIRouter

from app.config import settings
from app.services.dashboard import build_dashboard

router = APIRouter()


@router.get("/api/dashboard")
def dashboard(user_id: int = settings.demo_user_id):
    return build_dashboard(user_id)
