"""GET/DELETE /api/doubts: the history of questions typed to the tutor, searchable with ?q=."""
from fastapi import APIRouter

from app import auth
from app.services import doubts

router = APIRouter()


@router.get("/api/doubts")
def list_doubts(q: str = "", user_id: int = auth.CurrentUser):
    return doubts.list_doubts(user_id, q[:100])


@router.delete("/api/doubts")
def clear_doubts(user_id: int = auth.CurrentUser):
    return doubts.clear(user_id)


@router.delete("/api/doubts/{doubt_id}")
def delete_doubt(doubt_id: int, user_id: int = auth.CurrentUser):
    return doubts.delete_doubt(user_id, doubt_id)
