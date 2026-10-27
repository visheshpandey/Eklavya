"""Daily reminders: GET/PUT /api/reminders, POST /api/push/subscribe|unsubscribe, POST /api/reminders/test,
and POST /api/reminders/run (the daily scheduler; needs the X-Cron-Secret header)."""
import hmac

from fastapi import APIRouter, Header
from fastapi.concurrency import run_in_threadpool

from app import auth
from app.api.schemas import PushSubscription, ReminderSettings
from app.config import settings
from app.errors import UnauthorizedError
from app.services import reminders

router = APIRouter()


@router.get("/api/reminders")
def get_settings(user_id: int = auth.CurrentUser):
    return reminders.get_settings(user_id)


@router.put("/api/reminders")
def put_settings(req: ReminderSettings, user_id: int = auth.CurrentUser):
    return reminders.save_settings(user_id, req.push, req.email)


@router.post("/api/push/subscribe")
def subscribe(req: PushSubscription, user_id: int = auth.CurrentUser):
    return reminders.subscribe(user_id, {"endpoint": req.endpoint, "keys": req.keys})


@router.post("/api/push/unsubscribe")
def unsubscribe(req: PushSubscription, user_id: int = auth.CurrentUser):
    return reminders.unsubscribe(user_id, req.endpoint)


@router.post("/api/reminders/test")
async def send_test(user_id: int = auth.CurrentUser):
    return await run_in_threadpool(reminders.send_test, user_id)


@router.post("/api/reminders/run")
async def run(x_cron_secret: str = Header(default="")):
    if not settings.cron_secret or not hmac.compare_digest(x_cron_secret, settings.cron_secret):
        raise UnauthorizedError("Wrong scheduler secret.")
    return await run_in_threadpool(reminders.run_all)
