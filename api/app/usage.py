"""Best-effort usage metering for the gateway proxy.

Metering is always recorded on proxied requests; enforcement is opt-in via
``usage_enforcement_enabled`` so self-hosted deployments stay unlimited.  All
errors are swallowed — a metering failure must never break the proxy path.
"""

from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.licenses import LicenseService
from app.config import Settings
from app.repositories.usage import UsageRepository

logger = structlog.get_logger(__name__)


async def record_usage(
    session: AsyncSession,
    *,
    tenant_id: object,
    requests: int = 0,
    tool_calls: int = 0,
    rbac_denials: int = 0,
    rate_limit_rejections: int = 0,
) -> None:
    """Increment the tenant's daily usage counters, best-effort.

    The increment is committed immediately so it survives the request session
    closing (the proxy path never commits on its own).  A metering failure must
    never break the proxy path, so all errors are swallowed.
    """
    try:
        await UsageRepository(session).increment(
            tenant_id,
            requests=requests,
            tool_calls=tool_calls,
            rbac_denials=rbac_denials,
            rate_limit_rejections=rate_limit_rejections,
        )
        await session.commit()
    except Exception:  # noqa: BLE001 - metering must never break the proxy
        logger.warning("usage.record_failed", tenant_id=str(tenant_id))


async def monthly_tool_calls(session: AsyncSession, tenant_id: object) -> int:
    """Return the tenant's current-month tool-call total, best-effort."""
    try:
        return await UsageRepository(session).monthly_tool_calls(tenant_id)
    except Exception:  # noqa: BLE001
        return 0


def monthly_cap(plan, settings: Settings) -> int:
    """Return the plan's monthly tool-call cap, or 0 for unlimited."""
    if plan is None:
        return 0
    if plan.value == "pro":
        return settings.usage_monthly_cap_pro
    if plan.value == "enterprise":
        return settings.usage_monthly_cap_enterprise
    return settings.usage_monthly_cap_community


async def check_usage_cap(
    session: AsyncSession,
    tenant_id: object,
    settings: Settings,
) -> bool:
    """Return True if the tenant is under their plan's monthly cap.

    When enforcement is disabled (or the plan has no cap), always True.
    """
    if not settings.usage_enforcement_enabled:
        return True
    license = await LicenseService().current(session, tenant_id)
    plan = license.plan if license else None
    cap = monthly_cap(plan, settings)
    if cap <= 0:
        return True
    used = await monthly_tool_calls(session, tenant_id)
    return used < cap