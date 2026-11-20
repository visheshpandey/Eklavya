"""Route dependency for the per-minute limit on Gemini-backed calls (app/services/rate_limit.py)."""
from fastapi import Depends, Request
from fastapi.requests import HTTPConnection

from app import auth
from app.api.routes.auth import client_ip
from app.services import rate_limit


def caller(conn: HTTPConnection, user_id: int) -> str:
    """Who the limit is counted for: the student when the call carries a login (every browser has its own guest), else the address."""
    signed = conn.headers.get("authorization") or conn.query_params.get("token")
    return f"user:{user_id}" if signed else f"ip:{client_ip(conn)}"


def limited(kind: str):
    """``_: None = limited("ask")`` in a route's parameters counts the call and answers 429 once the minute's limit is used up."""
    def dependency(request: Request, user_id: int = auth.CurrentUser) -> None:
        rate_limit.check(kind, caller(request, user_id))
    return Depends(dependency)
