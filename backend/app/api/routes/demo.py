"""POST /api/demo/seed: reset the demo student (Precision at 38%) with the sample ML notes."""
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app import auth
from app.services.demo_seed import seed_demo

router = APIRouter()


@router.post("/api/demo/seed")
async def demo_seed(user_id: int = auth.CurrentUser):
    return await run_in_threadpool(seed_demo, user_id)
