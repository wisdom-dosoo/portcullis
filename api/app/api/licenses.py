"""Platform license management endpoint boundary.

Admin paths live under ``/admin/platform/license`` (platform admin only) and
cover issuing, viewing, and revoking the platform license.  A read-only org
view is exposed at ``/v1/license`` for any org admin to see their entitlements
without exposing the license key.  Tenant-scoped license management for the
Cloud control plane lives under ``/admin/tenants/{tenant_id}/license``.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.api.platform import _resolve_admin_user
from app.auth.dependencies import admin_subject, platform_admin_subject
from app.auth.licenses import LicenseService
from app.auth.subject import Subject
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.schemas import LicenseCreate, LicenseIssueResponse, LicenseUsageView, LicenseView
from app.repositories.org_members import OrgMemberRepository

admin_router = APIRouter(prefix="/admin/platform/license", tags=["admin-license"])
org_router = APIRouter(prefix="/v1/license", tags=["license"])
tenant_license_router = APIRouter(prefix="/admin/tenants/{tenant_id}/license", tags=["admin-license"])


@admin_router.get("", response_model=LicenseView | None)
async def admin_get_license(
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LicenseView | None:
    """Return the current platform license for the default tenant, or None."""
    license = await LicenseService().current(session, DEFAULT_TENANT_ID)
    if license is None:
        return None
    return LicenseView.model_validate(license)


@admin_router.post("", status_code=201, response_model=LicenseIssueResponse)
async def admin_issue_license(
    body: LicenseCreate,
    subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> LicenseIssueResponse:
    """Issue a new platform license (platform admin only).

    The plaintext license key is returned once in the response and never
    stored; only its hash is persisted.
    """
    _, user = await _resolve_admin_user(subject, session)
    license, key = await LicenseService().issue(
        session=session,
        tenant_id=DEFAULT_TENANT_ID,
        issuer_id=user.id,
        pepper=settings.api_key_pepper,
        plan=body.plan,
        licensee=body.licensee,
        seat_limit=body.seat_limit,
        server_limit=body.server_limit,
        expires_in_days=body.expires_in_days,
    )
    await session.commit()
    return LicenseIssueResponse(
        license=LicenseView.model_validate(license),
        key=key,
    )


@admin_router.post("/revoke", response_model=LicenseView)
async def admin_revoke_license(
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LicenseView:
    """Revoke the current active platform license, if any (platform admin only)."""
    license = await LicenseService().revoke(session, DEFAULT_TENANT_ID)
    if license is None:
        raise HTTPException(status_code=404, detail="No active license to revoke")
    await session.commit()
    return LicenseView.model_validate(license)


@org_router.get("", response_model=LicenseUsageView | None)
async def org_get_license(
    _subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LicenseUsageView | None:
    """Return the org's current license entitlements with usage, or None (admin only).

    Read-only — never exposes the license key itself.  Seat usage counts the
    tenant's org-member rows; server usage counts registered servers.
    """
    license = await LicenseService().current(session, DEFAULT_TENANT_ID)
    if license is None:
        return None
    members = await OrgMemberRepository(session).count(DEFAULT_TENANT_ID)
    from app.repositories.servers import ServerRepository

    servers = await ServerRepository(session).count(DEFAULT_TENANT_ID)
    return LicenseUsageView(
        **LicenseView.model_validate(license).model_dump(),
        seats_used=members,
        servers_used=servers,
    )


@tenant_license_router.get("", response_model=LicenseUsageView | None)
async def tenant_get_license(
    tenant_id: UUID,
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LicenseUsageView | None:
    """Return a managed tenant's license entitlements with usage (platform admin only)."""
    license = await LicenseService().current(session, tenant_id)
    if license is None:
        return None
    members = await OrgMemberRepository(session).count(tenant_id)
    from app.repositories.servers import ServerRepository

    servers = await ServerRepository(session).count(tenant_id)
    return LicenseUsageView(
        **LicenseView.model_validate(license).model_dump(),
        seats_used=members,
        servers_used=servers,
    )


@tenant_license_router.post("", status_code=201, response_model=LicenseIssueResponse)
async def tenant_issue_license(
    tenant_id: UUID,
    body: LicenseCreate,
    subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> LicenseIssueResponse:
    """Issue a new license for a managed tenant (platform admin only).

    This is the Cloud control plane's hook for seat/billing-tier changes: the
    control plane sets the plan, seat_limit, and term on the tenant's license.
    """
    _, user = await _resolve_admin_user(subject, session)
    license, key = await LicenseService().issue(
        session=session,
        tenant_id=tenant_id,
        issuer_id=user.id,
        pepper=settings.api_key_pepper,
        plan=body.plan,
        licensee=body.licensee,
        seat_limit=body.seat_limit,
        server_limit=body.server_limit,
        expires_in_days=body.expires_in_days,
    )
    await session.commit()
    return LicenseIssueResponse(
        license=LicenseView.model_validate(license),
        key=key,
    )


@tenant_license_router.post("/revoke", response_model=LicenseView)
async def tenant_revoke_license(
    tenant_id: UUID,
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LicenseView:
    """Revoke a managed tenant's current active license (platform admin only)."""
    license = await LicenseService().revoke(session, tenant_id)
    if license is None:
        raise HTTPException(status_code=404, detail="No active license to revoke")
    await session.commit()
    return LicenseView.model_validate(license)