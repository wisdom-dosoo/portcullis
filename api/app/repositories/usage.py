"""Usage metering repository for per-tenant daily counters."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import UsageDaily


class UsageRepository:
    """Data access for per-tenant daily usage counters."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def increment(
        self,
        tenant_id: UUID,
        *,
        requests: int = 0,
        tool_calls: int = 0,
        rbac_denials: int = 0,
        rate_limit_rejections: int = 0,
        day: date | None = None,
    ) -> None:
        """Increment the counters for the given tenant on the given day.

        Upserts a row on first increment for the day.  The caller commits the
        session; metering is intentionally fire-and-forget tolerant of the
        counter being a little stale under load.
        """
        usage_date = day or datetime.now(UTC).date()
        row = await self._get_or_create(tenant_id, usage_date)
        row.requests += requests
        row.tool_calls += tool_calls
        row.rbac_denials += rbac_denials
        row.rate_limit_rejections += rate_limit_rejections

    async def _get_or_create(self, tenant_id: UUID, usage_date: date) -> UsageDaily:
        result = await self._session.scalar(
            select(UsageDaily).where(
                UsageDaily.tenant_id == tenant_id,
                UsageDaily.usage_date == usage_date,
            )
        )
        if result is not None:
            return result
        row = UsageDaily(
            tenant_id=tenant_id,
            usage_date=usage_date,
            requests=0,
            tool_calls=0,
            rbac_denials=0,
            rate_limit_rejections=0,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def get_daily(
        self,
        tenant_id: UUID,
        start: date,
        end: date,
    ) -> list[UsageDaily]:
        """Return daily rows for the tenant within the inclusive date range."""
        result = await self._session.scalars(
            select(UsageDaily).where(
                UsageDaily.tenant_id == tenant_id,
                UsageDaily.usage_date >= start,
                UsageDaily.usage_date <= end,
            )
        )
        return list(result.all())

    async def totals(
        self,
        tenant_id: UUID,
        start: date,
        end: date,
    ) -> dict[str, int]:
        """Return summed counters for the tenant within the date range."""
        row = await self._session.execute(
            select(
                func.coalesce(func.sum(UsageDaily.requests), 0),
                func.coalesce(func.sum(UsageDaily.tool_calls), 0),
                func.coalesce(func.sum(UsageDaily.rbac_denials), 0),
                func.coalesce(func.sum(UsageDaily.rate_limit_rejections), 0),
            ).where(
                UsageDaily.tenant_id == tenant_id,
                UsageDaily.usage_date >= start,
                UsageDaily.usage_date <= end,
            )
        )
        requests, tool_calls, rbac_denials, rate_limit_rejections = row.one()
        return {
            "requests": int(requests),
            "tool_calls": int(tool_calls),
            "rbac_denials": int(rbac_denials),
            "rate_limit_rejections": int(rate_limit_rejections),
        }

    async def monthly_tool_calls(self, tenant_id: UUID) -> int:
        """Return total tool calls for the current calendar month."""
        today = datetime.now(UTC).date()
        first = today.replace(day=1)
        totals = await self.totals(tenant_id, first, today)
        return totals["tool_calls"]

    async def monthly_requests(self, tenant_id: UUID) -> int:
        """Return total requests for the current calendar month."""
        today = datetime.now(UTC).date()
        first = today.replace(day=1)
        totals = await self.totals(tenant_id, first, today)
        return totals["requests"]
