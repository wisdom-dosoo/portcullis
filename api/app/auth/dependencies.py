"""FastAPI authentication dependency boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.authenticate import authenticate
from app.auth.subject import Subject
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import SubjectType, UserApprovalStatus
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.users import UserRepository


async def current_subject(
    authorization: Annotated[str, Header()] = "",
    session: Annotated[AsyncSession, Depends(get_session)] = None,  # type: ignore[assignment]
    settings: Annotated[Settings, Depends(get_settings_dep)] = None,  # type: ignore[assignment]
) -> Subject:
    """Parse Bearer token and return the authenticated Subject.

    Dispatches between API key auth (``pk_`` prefix) and JWT bearer auth.
    Raises HTTPException(401) for any failure — missing header, malformed format,
    or invalid credentials. Never reveals internal details.
    """
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")
    try:
        return await authenticate(raw, settings, session)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


async def authenticated_subject(
    subject: Annotated[Subject, Depends(current_subject)],
) -> Subject:
    """Pass through any valid authenticated subject."""
    return subject


async def admin_subject(
    subject: Annotated[Subject, Depends(current_subject)],
) -> Subject:
    """Return subject only if they hold the 'admin' scope.

    Raises HTTPException(403) otherwise.
    """
    if not subject.has_scope("admin"):
        raise HTTPException(status_code=403, detail="Admin scope required")
    return subject


async def tenant_subject(
    subject: Annotated[Subject, Depends(current_subject)],
) -> UUID:
    """Return the tenant id scoping the authenticated subject.

    Today every key resolves to the sentinel tenant; real org tenants arrive
    in a later sub-project. This dependency is the explicit seam for that.
    """
    return subject.tenant_id


async def platform_admin_subject(
    subject: Annotated[Subject, Depends(current_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Subject:
    """Return subject only if it identifies a platform administrator.

    Accepts an API-key subject whose key is user-bound in the default tenant
    AND whose user has ``is_platform_admin`` set. A valid but non-admin
    subject raises 403; any invalid credential raises 401 (no detail leak).
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
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")
    if not user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform admin required")

    return subject
