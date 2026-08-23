"""License repository for tenant-scoped license operations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import License


class LicenseRepository:
    """Data access layer for platform license records."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def current(self, tenant_id: UUID) -> License | None:
        """Return the most recently issued license for the tenant, or None."""
        result = await self._session.scalars(
            select(License)
            .where(License.tenant_id == tenant_id)
            .order_by(License.created_at.desc())
            .limit(1)
        )
        return result.first()

    async def get_by_id(self, license_id: UUID, tenant_id: UUID) -> License | None:
        """Return a license by ID within a tenant, or None."""
        result = await self._session.scalars(
            select(License).where(
                License.id == license_id,
                License.tenant_id == tenant_id,
            )
        )
        return result.first()