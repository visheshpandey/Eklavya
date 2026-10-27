"""Application errors and the one place that turns them into HTTP responses.

Domain and agent code raises these instead of building JSON responses, so every endpoint
answers failures in the same shape: ``{"error": "<message>", "code": "<machine_code>"}``.
The frontend reads ``error`` to show the message.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)


class AppError(Exception):
    """Base class: an expected failure with a safe, user-facing message."""

    status_code = 500
    code = "internal_error"


class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "payload_too_large"


class TooManyRequestsError(AppError):
    status_code = 429
    code = "too_many_requests"


class LLMError(AppError):
    """Gemini failed (network, quota, timeout, or unusable output after one retry)."""

    status_code = 502
    code = "llm_unavailable"


def _body(message: str, code: str, **extra) -> dict:
    return {"error": message, "code": code, **extra}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        if exc.status_code >= 500:
            log.warning("%s: %s", exc.code, exc)
        return JSONResponse(status_code=exc.status_code, content=_body(str(exc), exc.code))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [{"field": ".".join(str(p) for p in e["loc"][1:]), "problem": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content=_body("The request was not valid.", "invalid_request", fields=fields))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content=_body(str(exc.detail), "http_error"))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return JSONResponse(status_code=500, content=_body("Something went wrong on the server.", "internal_error"))
