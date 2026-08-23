"""Org Member repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import OrgMember, OrgMemberRole


class OrgMemberRepository:
    """Data access layer for org member records scoped to a tenant."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, tenant_id: UUID, data: OrgMemberCreate) -> OrgMember:
        """Persist a new org member record and return the ORM instance."""
        member = OrgMember(
            tenant_id=tenant_id,
            user_subject=data.user_subject,
            admin_role=data.admin_role,
            team_id=data.team_id,
        )
        self._session.add(member)
        await self._session.flush()
        return member

    async def list(self, tenant_id: UUID) -> list[OrgMember]:
        """Return all org member records for the given tenant."""
        from app.models.orm import OrgMember
        result = await self._session.scalars(
            select(OrgMember).where(OrgMember.tenant_id == tenant_id)
        )
        return list(result.all())

    async def get(self, tenant_id: UUID, member_id: UUID) -> OrgMember | None:
        """Return the org member with the given ID scoped to tenant, or None if not found."""
        from app.models.orm import OrgMember
        result = await self._session.scalars(
            select(OrgMember).where(
                OrgMember.id == member_id,
                OrgMember.tenant_id == tenant_id,
            )
        )
        return result.first()

    async def get_by_subject(self, tenant_id: UUID, user_subject: str) -> OrgMember | None:
        """Return the org member with the given user_subject scoped to tenant."""
        from app.models.orm import OrgMember
        result = await self._session.scalars(
            select(OrgMember).where(
                OrgMember.tenant_id == tenant_id,
                OrgMember.user_subject == user_subject,
            )
        )
        return result.first()

    async def get_by_team(self, tenant_id: UUID, team_id: UUID) -> list[OrgMember]:
        """Return all org members belonging to a specific team."""
        from app.models.orm import OrgMember
        result = await self._session.scalars(
            select(OrgMember).where(
                OrgMember.tenant_id == tenant_id,
                OrgMember.team_id == team_id,
            )
        )
        return list(result.all())

    async def update(self, member: OrgMember, data: OrgMemberUpdate) -> OrgMember:
        """Apply partial updates to the member and return the updated ORM instance."""
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(member, field, value)
        await self._session.flush()
        return member

    async def delete(self, member: OrgMember) -> None:
        """Remove an org member from the database."""
        await self._session.delete(member)
        await self._session.flush()

    async def list_by_role(self, tenant_id: UUID, role: str) -> list[OrgMember]:
        """Return all org members with a specific role."""
        from app.models.orm import OrgMember
        result = await self._session.scalars(
            select(OrgMember).where(
                OrgMember.tenant_id == tenant_id,
                OrgMember.admin_role == OrgMemberRole(role),
            )
        )
        return list(result.all())

    async def count(self, tenant_id: UUID) -> int:
        """Count all org member records for the given tenant."""
        from app.models.orm import OrgMember
        result = await self._session.scalar(
            select(func.count(OrgMember.id)).where(OrgMember.tenant_id == tenant_id)
        )
        return int(result or 0)

    async def count_by_role(self, tenant_id: UUID, role: str) -> int:
        """Count org members with a specific role."""
        from sqlalchemy import func

        from app.models.orm import OrgMember
        result = await self._session.scalar(
            select(func.count(OrgMember.id)).where(
                OrgMember.tenant_id == tenant_id,
                OrgMember.admin_role == OrgMemberRole(role),
            )
        )
        return int(result or 0)