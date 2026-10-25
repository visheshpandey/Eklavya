"""GET /api/topics/{topic_id}."""
from fastapi import APIRouter

from app.config import settings
from app.services.topics import topic_detail

router = APIRouter()


@router.get("/api/topics/{topic_id}")
def get_topic(topic_id: int, user_id: int = settings.demo_user_id):
    return topic_detail(topic_id, user_id)
