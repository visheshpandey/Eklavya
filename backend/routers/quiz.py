"""POST /api/quiz/generate, /api/quiz/submit"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from agents import evaluation, quiz
from schemas import QuizGenerateRequest, QuizSubmitRequest

router = APIRouter()


@router.post("/api/quiz/generate")
def quiz_generate(req: QuizGenerateRequest):
    try:
        return {"questions": quiz.generate(req.user_id, req.topic_id, req.count, req.difficulty)}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.post("/api/quiz/submit")
def quiz_submit(req: QuizSubmitRequest):
    try:
        return evaluation.grade(req.user_id, req.question_id, req.student_answer, req.confidence)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
