"""GET /api/live: anonymous totals and a live activity feed for the dashboard page (live.html). Counts only, no names or text."""
from fastapi import APIRouter

from app.services import live_stats

router = APIRouter()


@router.get("/api/live")
def live():
    return live_stats.snapshot()
