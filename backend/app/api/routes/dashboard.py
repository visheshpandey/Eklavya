"""GET /api/dashboard, GET /api/mastery-history, GET /api/behind-the-scenes."""
from fastapi import APIRouter

from app import auth
from app.services import mastery_log, usage
from app.services.dashboard import build_dashboard

router = APIRouter()


@router.get("/api/dashboard")
def dashboard(user_id: int = auth.CurrentUser):
    return build_dashboard(user_id)


@router.get("/api/mastery-history")
def mastery_history(user_id: int = auth.CurrentUser):
    """{"topics": {topic_id: [{at, after, source}]}}: how each topic's mastery moved, for the sparklines."""
    return {"topics": mastery_log.history(user_id)}


@router.get("/api/behind-the-scenes")
def behind_the_scenes(user_id: int = auth.CurrentUser):
    """What the agents decided for this student, how long their Asks took, and how many Gemini calls the server made since it started."""
    return usage.report(user_id)
