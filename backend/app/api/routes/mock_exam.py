"""Mock exam: POST /api/mock-exam/start, POST /api/mock-exam/{id}/submit, GET /api/mock-exam/{id}, GET /api/mock-exams."""
from fastapi import APIRouter

from app import auth
from app.agents import mock_exam
from app.api.schemas import MockExamStart, MockExamSubmit

router = APIRouter()


@router.post("/api/mock-exam/start")
def start(req: MockExamStart, user_id: int = auth.CurrentUser):
    return mock_exam.start(user_id, req.count, req.minutes)


@router.post("/api/mock-exam/{exam_id}/submit")
def submit(exam_id: int, req: MockExamSubmit, user_id: int = auth.CurrentUser):
    return mock_exam.submit(user_id, exam_id, req.answers)


@router.get("/api/mock-exams")
def history(user_id: int = auth.CurrentUser):
    return {"exams": mock_exam.history(user_id)}


@router.get("/api/mock-exam/{exam_id}")
def report(exam_id: int, user_id: int = auth.CurrentUser):
    return mock_exam.report(user_id, exam_id)
