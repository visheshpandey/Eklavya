"""POST /api/feedback (three questions, once per student), GET /api/feedback/mine, GET /api/feedback/summary (counts, only with enough answers)."""
from fastapi import APIRouter
from pydantic import BaseModel

from app import auth
from app.services import feedback

router = APIRouter()


class FeedbackIn(BaseModel):
    easier: str
    trust: str
    rating: int


@router.post("/api/feedback")
def post_feedback(body: FeedbackIn, user_id: int = auth.CurrentUser):
    return feedback.save(user_id, body.easier, body.trust, body.rating)


@router.get("/api/feedback/mine")
def my_feedback(user_id: int = auth.CurrentUser):
    return {"given": feedback.given(user_id)}


@router.get("/api/feedback/summary")
def feedback_summary():
    return feedback.summary()
