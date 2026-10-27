"""Exam plan (GET/PUT/DELETE /api/plan) and concept map (GET /api/concept-map)."""
from fastapi import APIRouter

from app import auth
from app.api.schemas import PlanRequest
from app.services import study_plan

router = APIRouter()


@router.get("/api/plan")
def get_plan(user_id: int = auth.CurrentUser):
    return study_plan.get_plan(user_id)


@router.put("/api/plan")
def put_plan(req: PlanRequest, user_id: int = auth.CurrentUser):
    return study_plan.set_plan(user_id, req.exam_date, req.minutes_per_day)


@router.delete("/api/plan")
def delete_plan(user_id: int = auth.CurrentUser):
    return study_plan.clear_plan(user_id)


@router.get("/api/concept-map")
def get_concept_map(user_id: int = auth.CurrentUser):
    return study_plan.concept_map(user_id)
