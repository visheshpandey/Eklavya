"""Request bodies for the JSON endpoints. Validation errors are answered by ``app.errors`` (HTTP 422)."""
from pydantic import BaseModel, Field

from app.config import settings

DEMO_USER = settings.demo_user_id   # bodies still accept user_id for older clients, but the server ignores it: see app.auth


class TutorAskRequest(BaseModel):
    user_id: int = DEMO_USER
    question: str = Field(min_length=1, max_length=2000)
    language: str = "hinglish"  # english | hindi | hinglish
    subject: str | None = None
    document_id: int | None = None


class QuizGenerateRequest(BaseModel):
    user_id: int = DEMO_USER
    topic_id: int
    count: int = Field(default=5, ge=1, le=20)
    difficulty: str = "Medium"


class QuizSubmitRequest(BaseModel):
    user_id: int = DEMO_USER
    question_id: int
    student_answer: str = Field(min_length=1, max_length=500)
    confidence: float | None = Field(default=None, ge=0, le=1)  # None = use the latest voice tone signal


class MissionRequest(BaseModel):
    user_id: int = DEMO_USER


class PlanRequest(BaseModel):
    user_id: int = DEMO_USER
    exam_date: str = Field(min_length=10, max_length=10)        # YYYY-MM-DD
    minutes_per_day: int = Field(default=30, ge=15, le=240)


class FlashcardsRequest(BaseModel):
    user_id: int = DEMO_USER
    topic_id: int


class SignupRequest(BaseModel):
    name: str = Field(default="", max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class GoogleRequest(BaseModel):
    credential: str = Field(min_length=10, max_length=5000)   # the ID token from Google's sign-in button


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(default="", max_length=200)
    new_password: str = Field(max_length=200)


class ForgotRequest(BaseModel):
    email: str = Field(max_length=200)


class ResetRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(max_length=200)


class DeleteAccountRequest(BaseModel):
    password: str = Field(default="", max_length=200)
    confirm: str = Field(default="", max_length=200)   # Google-only accounts type their email instead


class FlashcardReviewRequest(BaseModel):
    knew: bool


class LinkRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class PushSubscription(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)
    keys: dict


class ReminderSettings(BaseModel):
    push: bool | None = None
    email: bool | None = None
