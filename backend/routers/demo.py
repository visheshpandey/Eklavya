"""POST /api/demo/seed"""
from fastapi import APIRouter

from seed import seed_demo

router = APIRouter()


@router.post("/api/demo/seed")
def demo_seed(user_id: int = 1):
    return seed_demo(user_id)
