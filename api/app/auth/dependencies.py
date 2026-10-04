"""FastAPI authentication dependency boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.authenticate import authenticate
from app.auth.subject import Subject
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import OrgMemberRole, SubjectType, UserApprovalStatus
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.users import UserRepository


async def current_subject(
    request: Request,
    authorization: Annotated[str, Header()] = "",
    session: Annotated[AsyncSession, Depends(get_session)] = None,  # type: ignore[assignment]
    settings: Annotated[Settings, Depends(get_settings_dep)] = None,  # type: ignore[assignment]
) -> Subject:
    """Parse Bearer token and return the authenticated Subject.

    Accepts ``Authorization: Bearer`` header (primary) with fallback to the
    HttpOnly ``portcullis_auth`` cookie minted by the SSO callback (P0: enables
    cookie-only SSO without leaking the API key in the URL query string).
    Raises HTTPException(401) for any failure. Never reveals internal details.
    """
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw:
        # P0 SSO: cookie fallback so /sso-callback works without ?token=.
        # Cookie is HttpOnly (set by backend), SameSite=Lax.
        raw = request.cookies.get("portcullis_auth", "").strip()
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
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Subject:
    """Return subject only if they hold admin privileges.

    P0 unification (previously dashboard 403 for all email users):
    allow when ANY of:
    - ``admin`` scope on the API key (bootstrap / platform keys), OR
    - backing User is platform admin / org_owner / org_admin, OR
    - OrgMember row (by user_id or oauth sub) holds ORG_OWNER / ORG_ADMIN.

    Raises HTTPException(403) otherwise.
    """
    if subject.has_scope("admin"):
        return subject
    try:
        from app.models.orm import OrgRole
        from app.repositories.org_members import OrgMemberRepository

        # API-key subjects: resolve backing user.
        if subject.subject_type is SubjectType.API_KEY:
            try:
                keys = ApiKeyRepository(session)
                api_key = await keys.get_by_id(UUID(subject.subject_id), subject.tenant_id)
            except (ValueError, AttributeError):
                api_key = None
            if api_key is not None and api_key.user_id is not None:
                users = UserRepository(session)
                user = await users.get_by_id(subject.tenant_id, api_key.user_id)
                if user is not None and user.is_active:
                    if user.is_platform_admin:
                        return subject
                    if user.org_role in (OrgRole.ORG_OWNER, OrgRole.ORG_ADMIN):
                        return subject
                # OrgMember by user_id string (see api/auth._get_current_org_member).
                members = OrgMemberRepository(session)
                member = await members.get_by_subject(
                    subject.tenant_id, str(api_key.user_id) if api_key else ""
                )
                if member is not None and member.admin_role in (
                    OrgMemberRole.ORG_OWNER,
                    OrgMemberRole.ORG_ADMIN,
                ):
                    return subject
        # OAuth subjects (and API-key fallback): direct OrgMember by sub.
        members = OrgMemberRepository(session)
        member = await members.get_by_subject(subject.tenant_id, subject.subject_id)
        if member is not None and member.admin_role in (
            OrgMemberRole.ORG_OWNER,
            OrgMemberRole.ORG_ADMIN,
        ):
            return subject
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - fail closed on any lookup error
        pass
    raise HTTPException(status_code=403, detail="Admin scope required")


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
