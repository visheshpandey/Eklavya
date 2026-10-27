"""Accounts: sign up, sign in (password or Google), who am I, change or reset the password, delete the account."""
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool

from app import accounts, auth, db
from app.api.schemas import (ChangePasswordRequest, DeleteAccountRequest, ForgotRequest, GoogleRequest, LoginRequest,
                             ResetRequest, SignupRequest)
from app.config import settings

router = APIRouter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")   # Render and Vercel put the real address first
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.get("/api/auth/config")
def config():
    return accounts.server_features()


@router.post("/api/auth/signup")
async def signup(req: SignupRequest, request: Request):
    return await run_in_threadpool(accounts.signup, req.name, req.email, req.password, client_ip(request))   # scrypt: off the event loop


@router.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    return await run_in_threadpool(accounts.login, req.email, req.password, client_ip(request))


@router.post("/api/auth/google")
async def google(req: GoogleRequest, request: Request):
    return await run_in_threadpool(accounts.google_sign_in, req.credential, client_ip(request))


@router.get("/api/auth/me")
def me(user_id: int = auth.CurrentUser):
    if user_id == settings.demo_user_id:
        return {"id": user_id, "name": "Demo student", "email": None, "guest": True}
    row = db.one("SELECT * FROM users WHERE id = ?", (user_id,))
    return {**auth.public_user(row), "has_password": bool(row.get("password_hash")), "google": bool(row.get("google_sub"))}


@router.post("/api/auth/password")
async def change_password(req: ChangePasswordRequest, user_id: int = auth.CurrentUser):
    return await run_in_threadpool(accounts.change_password, user_id, req.current_password, req.new_password)


@router.post("/api/auth/forgot")
async def forgot(req: ForgotRequest, request: Request):
    return await run_in_threadpool(accounts.forgot_password, req.email, client_ip(request))


@router.post("/api/auth/reset")
async def reset(req: ResetRequest):
    return await run_in_threadpool(accounts.reset_password, req.token, req.password)


@router.post("/api/auth/delete")
async def delete(req: DeleteAccountRequest, user_id: int = auth.CurrentUser):
    return await run_in_threadpool(accounts.delete_account, user_id, req.password, req.confirm)
