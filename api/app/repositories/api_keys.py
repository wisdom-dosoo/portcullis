"""API key repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import ApiKey


class ApiKeyRepository:
    """Data access layer for API key records."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        tenant_id: UUID,
        name: str,
        key_prefix: str,
        key_hash: str,
        scopes: list[str],
    ) -> ApiKey:
        """Persist a new API key record and return the ORM instance."""
        api_key = ApiKey(
            tenant_id=tenant_id,
            name=name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            scopes=scopes,
        )
        self._session.add(api_key)
        await self._session.flush()
        return api_key

    async def get_by_prefix(self, prefix: str) -> ApiKey | None:
        """Return the active (non-revoked) key with the given prefix, or None."""
        result = await self._session.scalars(
            select(ApiKey).where(
                ApiKey.key_prefix == prefix,
                ApiKey.revoked_at.is_(None),
            )
        )
        return result.first()

    async def list_active(self, tenant_id: UUID) -> list[ApiKey]:
        """Return all non-revoked API keys for the given tenant."""
        result = await self._session.scalars(
            select(ApiKey).where(
                ApiKey.tenant_id == tenant_id,
                ApiKey.revoked_at.is_(None),
            )
        )
        return list(result.all())

    async def revoke(self, key_id: UUID, tenant_id: UUID) -> bool:
        """Set revoked_at on the key; returns False if not found or already revoked."""
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            update(ApiKey)
            .where(
                ApiKey.id == key_id,
                ApiKey.tenant_id == tenant_id,
                ApiKey.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        return cursor.rowcount > 0

    async def update_last_used(self, key_id: UUID) -> None:
        """Stamp last_used_at for the given key (fire-and-forget, no explicit commit)."""
        await self._session.execute(
            update(ApiKey).where(ApiKey.id == key_id).values(last_used_at=datetime.now(UTC))
        )
