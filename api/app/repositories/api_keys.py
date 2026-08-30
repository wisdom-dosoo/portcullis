"""API key repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
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
        user_id: UUID | None = None,
    ) -> ApiKey:
        """Persist a new API key record and return the ORM instance."""
        api_key = ApiKey(
            tenant_id=tenant_id,
            user_id=user_id,
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

    async def get_by_id(self, key_id: UUID, tenant_id: UUID) -> ApiKey | None:
        """Return the active (non-revoked) key with the given ID, or None."""
        result = await self._session.scalars(
            select(ApiKey).where(
                ApiKey.id == key_id,
                ApiKey.tenant_id == tenant_id,
                ApiKey.revoked_at.is_(None),
            )
        )
        return result.first()

    async def get_by_id_any_status(self, key_id: UUID, tenant_id: UUID) -> ApiKey | None:
        """Return the key with the given ID regardless of revocation status."""
        result = await self._session.scalars(
            select(ApiKey).where(
                ApiKey.id == key_id,
                ApiKey.tenant_id == tenant_id,
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

    async def list_by_subject(self, subject_id: UUID) -> list[ApiKey]:
        """Return all API keys for a subject (by user_id)."""
        result = await self._session.scalars(
            select(ApiKey)
            .where(
                ApiKey.user_id == subject_id,
            )
            .order_by(ApiKey.created_at.desc())
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

    # --- Rotation support methods ---

    async def get_expiring_keys(self, warning_days: int, max_age_days: int) -> list[ApiKey]:
        """Get keys that are expiring within warning_days or have exceeded max_age_days."""
        now = datetime.now(UTC)
        warning_threshold = now + timedelta(days=warning_days)
        max_age_threshold = now - timedelta(days=max_age_days) if max_age_days else None

        stmt = select(ApiKey).where(
            ApiKey.revoked_at.is_(None),
            ApiKey.expires_at.is_not(None),
            ApiKey.expires_at <= warning_threshold,
        )
        if max_age_threshold:
            stmt = stmt.where(ApiKey.created_at < max_age_threshold)

        result = await self._session.scalars(stmt)
        return list(result.all())

    async def get_expired_keys(self) -> list[ApiKey]:
        """Get all expired but not revoked keys."""
        now = datetime.now(UTC)
        result = await self._session.scalars(
            select(ApiKey).where(
                ApiKey.revoked_at.is_(None),
                ApiKey.expires_at.is_not(None),
                ApiKey.expires_at < now,
            )
        )
        return list(result.all())

    async def list_by_tenant_and_status(
        self, tenant_id: UUID, active_only: bool = True
    ) -> list[ApiKey]:
        """List keys for a tenant, optionally filtering by active status."""
        stmt = select(ApiKey).where(ApiKey.tenant_id == tenant_id)
        if active_only:
            stmt = stmt.where(ApiKey.revoked_at.is_(None))
        stmt = stmt.order_by(ApiKey.created_at.desc())
        result = await self._session.scalars(stmt)
        return list(result.all())
