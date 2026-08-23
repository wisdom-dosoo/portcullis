"""Platform-admin tenant provisioning endpoint boundary.

``POST /admin/tenants`` is the HTTP twin of the ``provision-tenant`` CLI
command.  Both delegate to the shared ``ProvisioningService`` so the control
plane can provision a managed tenant over the API with identical semantics to
a manual operator provisioning one via the CLI.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.api.platform import _resolve_admin_user
from app.auth.dependencies import platform_admin_subject
from app.auth.subject import Subject
from app.config import Settings
from app.models.orm import License, LicenseStatus, Tenant
from app.models.schemas import (
    LicenseView,
    TenantProvisionRequest,
    TenantProvisionResponse,
    TenantView,
    UserView,
)
from app.provisioning import ProvisioningError, ProvisioningService

router = APIRouter(prefix="/admin/tenants", tags=["admin-tenants"])


async def _list_tenants_with_plan(session: AsyncSession) -> list[TenantView]:
    """Return all tenants with their current active license plan, newest first."""
    tenants = await session.scalars(select(Tenant).order_by(Tenant.created_at.desc()))
    rows = tenants.all()
    if not rows:
        return []

    license_rows = await session.scalars(
        select(License.tenant_id, License.plan)
        .where(
            License.tenant_id.in_([t.id for t in rows]),
            License.status == LicenseStatus.ACTIVE,
        )
        .distinct()
    )
    plans = {tenant_id: plan for tenant_id, plan in license_rows.all()}

    views: list[TenantView] = []
    for t in rows:
        view = TenantView.model_validate(t)
        view.plan = plans.get(t.id)
        views.append(view)
    return views


@router.get("", response_model=list[TenantView])
async def list_tenants(
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TenantView]:
    """List all provisioned tenants, newest first (platform admin only)."""
    return await _list_tenants_with_plan(session)


@router.post("", status_code=201, response_model=TenantProvisionResponse)
async def provision_tenant(
    body: TenantProvisionRequest,
    subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> TenantProvisionResponse:
    """Provision a new managed tenant (platform admin only).

    Creates the tenant, owner account, org membership, default roles, owner API
    key, and platform license in one call.  The response contains the one-time
    owner access token and license key; the owner password is echoed only when
    it was generated server-side.
    """
    _, admin = await _resolve_admin_user(subject, session)
    try:
        result = await ProvisioningService().provision_tenant(
            session,
            settings,
            name=body.name,
            slug=body.slug,
            owner_email=body.owner_email,
            owner_full_name=body.owner_full_name,
            plan=body.plan,
            licensee=body.licensee or body.name,
            seat_limit=body.seat_limit,
            server_limit=body.server_limit,
            expires_in_days=body.expires_in_days,
            owner_password=body.owner_password,
            issuer_id=admin.id,
        )
    except ProvisioningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return TenantProvisionResponse(
        tenant=TenantView.model_validate(result.tenant),
        owner=UserView.model_validate(result.owner),
        access_token=result.access_token,
        owner_password=result.owner_password if body.owner_password is None else None,
        license=LicenseView.model_validate(result.license),
        license_key=result.license_key,
    )