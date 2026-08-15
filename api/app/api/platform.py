"""Platform-admin introspection endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import platform_admin_subject
from app.auth.subject import Subject
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import SubjectType, UserApprovalStatus
from app.models.schemas import PlatformAdminMe, UserView
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.users import UserRepository

router = APIRouter(prefix="/admin/platform", tags=["admin-platform"])


async def _resolve_admin_user(
    subject: Subject,
    session: AsyncSession,
) -> tuple[object, UserView]:
    """Resolve the platform-admin api key + user from a subject.

    Mirrors ``/auth/me``: reads the api_keys row by id in the default tenant,
    then the bound user. Raises HTTPException 401 for missing/invalid creds and
    403 if the resolved user is not a platform admin.
    """
    if subject.subject_type is not SubjectType.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    keys = ApiKeyRepository(session)
    api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
    if api_key is None or api_key.user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    repo = UserRepository(session)
    user = await repo.get_by_id(DEFAULT_TENANT_ID, api_key.user_id)
    if (
        user is None
        or not user.is_active
        or user.approval_status is not UserApprovalStatus.APPROVED
        or not user.is_platform_admin
    ):
        raise HTTPException(status_code=403, detail="Platform admin required")

    return api_key, UserView.model_validate(user)


@router.get("/me", response_model=PlatformAdminMe)
async def platform_admin_me(
    subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformAdminMe:
    """Return the platform-admin status of the current subject."""
    _, user = await _resolve_admin_user(subject, session)
    return PlatformAdminMe(is_platform_admin=True, user=user)
