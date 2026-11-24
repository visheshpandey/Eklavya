"""The owner's admin routes: GET /api/admin/students (the list of signed-up students) and GET /api/admin/export (a full copy of the data).

Both need the ADMIN_KEY secret in the X-Admin-Key header. With no ADMIN_KEY set the routes do not exist (404), so a server that never
configured it exposes nothing. Wrong keys are counted per address, so the key cannot be guessed by trying many.
"""
import hmac

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.routes.auth import client_ip
from app.config import settings
from app.errors import NotFoundError, UnauthorizedError
from app.services import admin_export, admin_students, rate_limit

router = APIRouter()
WRONG_KEY_LIMIT = 8   # wrong keys per address per minute
NO_STORE = {"Cache-Control": "no-store"}


def _require_key(request: Request) -> None:
    if not settings.admin_key:
        raise NotFoundError("Not found")
    supplied = request.headers.get("x-admin-key", "")
    if not hmac.compare_digest(supplied.encode(), settings.admin_key.encode()):
        rate_limit.check("admin-key", client_ip(request), limit=WRONG_KEY_LIMIT)
        raise UnauthorizedError("That admin key is not right.")


@router.get("/api/admin/students")
def students(request: Request):
    _require_key(request)
    return JSONResponse({"students": admin_students.students()}, headers=NO_STORE)


@router.get("/api/admin/export")
def export(request: Request):
    _require_key(request)
    return JSONResponse(admin_export.export(), headers={**NO_STORE, "Content-Disposition": 'attachment; filename="eklavya-data.json"'})
