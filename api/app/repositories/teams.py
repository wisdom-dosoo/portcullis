"""Team repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Team
from app.models.schemas import TeamCreate, TeamUpdate


class TeamRepository:
    """Data access layer for team records scoped to a tenant."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, tenant_id: UUID, data: TeamCreate) -> Team:
        """Persist a new team record and return the ORM instance."""
        team = Team(tenant_id=tenant_id, name=data.name)
        self._session.add(team)
        await self._session.flush()
        return team

    async def list(self, tenant_id: UUID) -> list[Team]:
        """Return all team records for the given tenant."""
        result = await self._session.scalars(select(Team).where(Team.tenant_id == tenant_id))
        return list(result.all())

    async def get(self, tenant_id: UUID, team_id: UUID) -> Team | None:
        """Return the team with the given ID scoped to tenant, or None if not found."""
        result = await self._session.scalars(
            select(Team).where(
                Team.id == team_id,
                Team.tenant_id == tenant_id,
            )
        )
        return result.first()

    async def get_by_name(self, tenant_id: UUID, name: str) -> Team | None:
        """Return the team with the given name scoped to tenant, or None if not found."""
        result = await self._session.scalars(
            select(Team).where(
                Team.tenant_id == tenant_id,
                Team.name == name,
            )
        )
        return result.first()

    async def update(self, team: Team, data: TeamUpdate) -> Team:
        """Apply the non-None fields from data to the team ORM instance."""
        if data.name is not None:
            team.name = data.name
        await self._session.flush()
        return team

    async def delete(self, team: Team) -> None:
        """Remove a team record from the database."""
        await self._session.delete(team)
        await self._session.flush()

    async def add_server(self, team_id: UUID, server_id: UUID) -> None:
        """Associate a server with a team (many-to-many)."""
        from app.models.orm import TeamServer

        link = TeamServer(team_id=team_id, server_id=server_id)
        self._session.add(link)
        await self._session.flush()

    async def remove_server(self, team_id: UUID, server_id: UUID) -> bool:
        """Remove a server from a team. Returns True if a row was deleted."""
        from sqlalchemy import delete
        from sqlalchemy.engine import CursorResult

        from app.models.orm import TeamServer

        cursor: CursorResult[tuple[()]] = await self._session.execute(
            delete(TeamServer).where(
                TeamServer.team_id == team_id,
                TeamServer.server_id == server_id,
            )
        )
        return cursor.rowcount > 0

    async def get_servers(self, team_id: UUID) -> list[UUID]:
        """Return all server IDs associated with a team."""
        from app.models.orm import TeamServer

        result = await self._session.scalars(
            select(TeamServer.server_id).where(TeamServer.team_id == team_id)
        )
        return list(result.all())


class OrgMemberRepository:
    """Data access layer for org member records scoped to a tenant."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, tenant_id: UUID, data: OrgMemberCreate) -> OrgMember:
        """Persist a new org member record and return the ORM instance."""
        from app.models.orm import OrgMember

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
        from app.models.orm import OrgMember, OrgMemberRole

        result = await self._session.scalars(
            select(OrgMember).where(
                OrgMember.tenant_id == tenant_id,
                OrgMember.admin_role == OrgMemberRole(role),
            )
        )
        return list(result.all())

    async def count_by_role(self, tenant_id: UUID, role: str) -> int:
        """Count org members with a specific role."""
        from sqlalchemy import func

        from app.models.orm import OrgMember, OrgMemberRole

        result = await self._session.scalar(
            select(func.count(OrgMember.id)).where(
                OrgMember.tenant_id == tenant_id,
                OrgMember.admin_role == OrgMemberRole(role),
            )
        )
        return int(result or 0)
