"""Pydantic request/response models for all /api endpoints (PRD s8)."""
from pydantic import BaseModel


class TutorAskRequest(BaseModel):
    user_id: int = 1
    question: str
    language: str = "hinglish"  # english | hindi | hinglish
    subject: str | None = None
    document_id: int | None = None


class QuizGenerateRequest(BaseModel):
    user_id: int = 1
    topic_id: int
    count: int = 5
    difficulty: str = "Medium"


class QuizSubmitRequest(BaseModel):
    user_id: int = 1
    question_id: int
    student_answer: str
    confidence: float | None = None  # 0-1; None = use latest voice tone signal


class MissionRequest(BaseModel):
    user_id: int = 1
