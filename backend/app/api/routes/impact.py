"""GET /api/impact: the monthly cost of one student, computed from the configured models (see app.domain.impact)."""
from fastapi import APIRouter

from app.config import settings
from app.domain.impact import monthly_cost

router = APIRouter()


@router.get("/api/impact")
def impact():
    return monthly_cost(settings.gemini_model, settings.gemini_live_model, settings.gemini_embed_model, settings.live_voice)
