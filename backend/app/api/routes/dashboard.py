"""GET /api/dashboard, GET /api/mastery-history."""
from fastapi import APIRouter

from app import auth
from app.services import mastery_log
from app.services.dashboard import build_dashboard

router = APIRouter()


@router.get("/api/dashboard")
def dashboard(user_id: int = auth.CurrentUser):
    return build_dashboard(user_id)


@router.get("/api/mastery-history")
def mastery_history(user_id: int = auth.CurrentUser):
    """{"topics": {topic_id: [{at, after, source}]}}: how each topic's mastery moved, for the sparklines."""
    return {"topics": mastery_log.history(user_id)}
