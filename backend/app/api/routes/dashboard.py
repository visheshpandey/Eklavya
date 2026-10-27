"""GET /api/dashboard."""
from fastapi import APIRouter

from app import auth
from app.services.dashboard import build_dashboard

router = APIRouter()


@router.get("/api/dashboard")
def dashboard(user_id: int = auth.CurrentUser):
    return build_dashboard(user_id)
