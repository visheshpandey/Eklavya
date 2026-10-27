"""GET /api/topics/{topic_id}."""
from fastapi import APIRouter

from app import auth
from app.services.topics import topic_detail

router = APIRouter()


@router.get("/api/topics/{topic_id}")
def get_topic(topic_id: int, user_id: int = auth.CurrentUser):
    return topic_detail(topic_id, user_id)
