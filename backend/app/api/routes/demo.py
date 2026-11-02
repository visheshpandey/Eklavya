"""POST /api/demo/seed: reset the demo student (three notes documents, a week of history, a 4-day streak). GET /api/demo/circle: the seeded study circle."""
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app import auth
from app.services.demo_seed import circle, seed_demo

router = APIRouter()


@router.post("/api/demo/seed")
async def demo_seed(user_id: int = auth.CurrentUser):
    return await run_in_threadpool(seed_demo, user_id)


@router.get("/api/demo/circle")
def demo_circle():
    """The demo student's study circle (friends, weekly gains, shared notes): fixture data, shown only in demo mode."""
    return circle()
