"""Invitation repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Invitation, InvitationStatus


class InvitationRepository:
    """Data access layer for invitation records."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        tenant_id: UUID,
        code_hash: str,
        org_name: str,
        created_by: UUID | None = None,
        email: str | None = None,
        expires_at: datetime | None = None,
    ) -> Invitation:
        """Persist a new invitation and return the ORM instance."""
        invitation = Invitation(
            tenant_id=tenant_id,
            created_by=created_by,
            org_name=org_name,
            email=email,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        self._session.add(invitation)
        await self._session.flush()
        return invitation

    async def get_by_id(self, invite_id: UUID, tenant_id: UUID) -> Invitation | None:
        """Return an invitation by ID within a tenant, or None."""
        result = await self._session.scalars(
            select(Invitation).where(
                Invitation.id == invite_id,
                Invitation.tenant_id == tenant_id,
            )
        )
        return result.first()

    async def get_by_code_hash(self, tenant_id: UUID, code_hash: str) -> Invitation | None:
        """Return an invitation with the given code hash within a tenant."""
        result = await self._session.scalars(
            select(Invitation).where(
                Invitation.tenant_id == tenant_id,
                Invitation.code_hash == code_hash,
            )
        )
        return result.first()

    async def list(self, tenant_id: UUID) -> list[Invitation]:
        """Return all invitations for the tenant, newest first."""
        result = await self._session.scalars(
            select(Invitation)
            .where(Invitation.tenant_id == tenant_id)
            .order_by(Invitation.created_at.desc())
        )
        return list(result.all())

    async def mark_redeemed(
        self,
        invite_id: UUID,
        redeemed_by: UUID,
        now: datetime | None = None,
    ) -> bool:
        """Mark an invitation as used by the given user. Returns False if missing."""
        stamp = now if now is not None else datetime.now(UTC)
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            update(Invitation)
            .where(
                Invitation.id == invite_id,
                Invitation.status == InvitationStatus.ACTIVE,
            )
            .values(
                status=InvitationStatus.USED,
                redeemed_by=redeemed_by,
                redeemed_at=stamp,
            )
        )
        return cursor.rowcount > 0

    async def revoke(self, invite_id: UUID, tenant_id: UUID) -> bool:
        """Revoke an invitation; returns False if not found or already used."""
        stamp = datetime.now(UTC)
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            update(Invitation)
            .where(
                Invitation.id == invite_id,
                Invitation.tenant_id == tenant_id,
                Invitation.status == InvitationStatus.ACTIVE,
            )
            .values(status=InvitationStatus.REVOKED, revoked_at=stamp)
        )
        return cursor.rowcount > 0
