"""Tenant repository for tenant CRUD operations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Tenant


class TenantRepository:
    """Data access layer for tenant records."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, tenant_id: UUID) -> Tenant | None:
        """Return the tenant with the given ID, or None if not found."""
        result = await self._session.scalars(select(Tenant).where(Tenant.id == tenant_id))
        return result.first()

    async def get_by_slug(self, slug: str) -> Tenant | None:
        """Return the tenant with the given slug, or None if not found."""
        result = await self._session.scalars(select(Tenant).where(Tenant.slug == slug))
        return result.first()

    async def list(self) -> list[Tenant]:
        """Return all tenants ordered by created_at DESC."""
        result = await self._session.scalars(select(Tenant).order_by(Tenant.created_at.desc()))
        return list(result.all())
