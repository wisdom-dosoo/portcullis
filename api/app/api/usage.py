"""Usage metering endpoint boundary.

  * ``GET /v1/usage`` — the org's usage for the current month (any authenticated
    subject).  Returns the summed counters plus the plan's monthly request cap
    and whether enforcement is on, so the dashboard can show a progress bar.
  * ``GET /admin/usage`` — platform-admin aggregate across all tenants for the
    current month (the Cloud control plane's billing feed).

Metering records usage on every proxied request; enforcement is opt-in via
``usage_enforcement_enabled`` so self-hosted deployments stay unlimited.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import authenticated_subject, platform_admin_subject
from app.auth.licenses import LicenseService
from app.auth.subject import Subject
from app.config import Settings
from app.models.orm import UsageDaily
from app.models.schemas import UsageTotalsView, UsageView
from app.repositories.usage import UsageRepository

router = APIRouter(tags=["usage"])


def _monthly_cap(plan, settings: Settings) -> int:
    """Return the monthly request cap for the plan, or 0 for unlimited."""
    if plan is None:
        return 0
    if plan.value == "pro":
        return settings.usage_monthly_cap_pro
    if plan.value == "enterprise":
        return settings.usage_monthly_cap_enterprise
    return settings.usage_monthly_cap_community


@router.get("/v1/usage", response_model=UsageView)
async def org_usage(
    subject: Annotated[Subject, Depends(authenticated_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> UsageView:
    """Return the org's current-month usage and plan limits."""
    today = datetime.now(UTC).date()
    first = today.replace(day=1)
    totals = await UsageRepository(session).totals(subject.tenant_id, first, today)
    license = await LicenseService().current(session, subject.tenant_id)
    plan = license.plan if license else None
    cap = _monthly_cap(plan, settings)
    return UsageView(
        period_start=first,
        period_end=today,
        **totals,
        plan=plan,
        monthly_request_cap=cap,
        enforcement_enabled=settings.usage_enforcement_enabled,
    )


@router.get("/admin/usage", response_model=list[UsageView])
async def admin_usage(
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> list[UsageView]:
    """Return current-month usage for every tenant (platform admin only).

    This is the billing feed the Cloud control plane consumes: one entry per
    tenant with the summed counters and the plan's monthly cap.
    """
    today = datetime.now(UTC).date()
    first = today.replace(day=1)
    result = await session.scalars(
        select(UsageDaily).where(
            UsageDaily.usage_date >= first,
            UsageDaily.usage_date <= today,
        )
    )
    rows = list(result.all())

    by_tenant: dict = {}
    for row in rows:
        bucket = by_tenant.setdefault(
            row.tenant_id,
            {"requests": 0, "tool_calls": 0, "rbac_denials": 0, "rate_limit_rejections": 0},
        )
        bucket["requests"] += row.requests
        bucket["tool_calls"] += row.tool_calls
        bucket["rbac_denials"] += row.rbac_denials
        bucket["rate_limit_rejections"] += row.rate_limit_rejections

    views: list[UsageView] = []
    for tenant_id, bucket in by_tenant.items():
        license = await LicenseService().current(session, tenant_id)
        plan = license.plan if license else None
        views.append(
            UsageView(
                period_start=first,
                period_end=today,
                **bucket,
                plan=plan,
                monthly_request_cap=_monthly_cap(plan, settings),
                enforcement_enabled=settings.usage_enforcement_enabled,
            )
        )
    views.sort(key=lambda v: v.requests, reverse=True)
    return views


__all__ = ["UsageTotalsView", "router"]
