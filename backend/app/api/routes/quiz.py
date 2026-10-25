"""POST /api/quiz/generate and /api/quiz/submit."""
from fastapi import APIRouter

from app.agents import evaluation, quiz
from app.api.schemas import QuizGenerateRequest, QuizSubmitRequest

router = APIRouter()


@router.post("/api/quiz/generate")
def quiz_generate(req: QuizGenerateRequest):
    return {"questions": quiz.generate(req.user_id, req.topic_id, req.count, req.difficulty)}


@router.post("/api/quiz/submit")
def quiz_submit(req: QuizSubmitRequest):
    return evaluation.grade(req.user_id, req.question_id, req.student_answer, req.confidence)
