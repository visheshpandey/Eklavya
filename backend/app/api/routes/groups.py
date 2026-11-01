"""Study groups (/api/groups) and friend challenges (/api/challenges). Both need a signed-in account."""
from fastapi import APIRouter

from app import auth
from app.api.schemas import ChallengeCreate, ChallengePlay, GroupCreate, GroupJoin, GroupShare
from app.services import challenges, groups

router = APIRouter()


@router.get("/api/groups")
def my_groups(user_id: int = auth.CurrentUser):
    return {"groups": groups.my_groups(user_id)}


@router.post("/api/groups")
def create_group(req: GroupCreate, user_id: int = auth.CurrentUser):
    return groups.create(user_id, req.name)


@router.post("/api/groups/join")
def join_group(req: GroupJoin, user_id: int = auth.CurrentUser):
    return groups.join(user_id, req.code)


@router.get("/api/groups/{group_id}")
def group_detail(group_id: int, user_id: int = auth.CurrentUser):
    return groups.detail(user_id, group_id)


@router.delete("/api/groups/{group_id}/members/me")
def leave_group(group_id: int, user_id: int = auth.CurrentUser):
    return groups.leave(user_id, group_id)


@router.post("/api/groups/{group_id}/notes")
def share_notes(group_id: int, req: GroupShare, user_id: int = auth.CurrentUser):
    return groups.share(user_id, group_id, req.document_id)


@router.delete("/api/groups/{group_id}/notes/{document_id}")
def unshare_notes(group_id: int, document_id: int, user_id: int = auth.CurrentUser):
    return groups.unshare(user_id, group_id, document_id)


@router.post("/api/groups/{group_id}/notes/{document_id}/add")
def add_notes(group_id: int, document_id: int, user_id: int = auth.CurrentUser):
    return groups.copy_notes(user_id, group_id, document_id)


@router.get("/api/challenges")
def my_challenges(user_id: int = auth.CurrentUser):
    return {"challenges": challenges.mine(user_id)}


@router.post("/api/challenges")
def create_challenge(req: ChallengeCreate, user_id: int = auth.CurrentUser):
    return challenges.create(user_id, req.topic_id)


@router.get("/api/challenges/{code}")
def open_challenge(code: str, user_id: int = auth.CurrentUser):
    return challenges.open_challenge(user_id, code)


@router.get("/api/challenges/{code}/result")
def challenge_result(code: str, user_id: int = auth.CurrentUser):
    return challenges.detail(user_id, code)


@router.post("/api/challenges/{code}/play")
def play_challenge(code: str, req: ChallengePlay, user_id: int = auth.CurrentUser):
    return challenges.play(user_id, code, req.answers, req.seconds)
