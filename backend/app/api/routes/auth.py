"""Accounts: POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me (who am I; the demo student when no token)."""
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app import auth, db
from app.api.schemas import LoginRequest, SignupRequest
from app.config import settings

router = APIRouter()


@router.post("/api/auth/signup")
async def signup(req: SignupRequest):
    return await run_in_threadpool(auth.sign_up, req.name, req.email, req.password)    # scrypt is slow on purpose: off the event loop


@router.post("/api/auth/login")
async def login(req: LoginRequest):
    return await run_in_threadpool(auth.sign_in, req.email, req.password)


@router.get("/api/auth/me")
def me(user_id: int = auth.CurrentUser):
    if user_id == settings.demo_user_id:
        return {"id": user_id, "name": "Demo student", "email": None, "guest": True}
    return auth.public_user(db.one("SELECT * FROM users WHERE id = ?", (user_id,)))
