"""User repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import OrgRole, User, UserApprovalStatus


class UserRepository:
    """Data access layer for user records."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def count(self, tenant_id: UUID) -> int:
        """Return the number of users in the tenant."""
        result = await self._session.scalar(
            select(func.count(User.id)).where(User.tenant_id == tenant_id)
        )
        return int(result or 0)

    async def create(
        self,
        tenant_id: UUID,
        email: str,
        password_hash: str,
        full_name: str,
        org_name: str | None,
        intended_use: str | None,
        approval_status: UserApprovalStatus = UserApprovalStatus.APPROVED,
        org_role: OrgRole | None = None,
    ) -> User:
        """Persist a new user record and return the ORM instance."""
        user = User(
            tenant_id=tenant_id,
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            org_name=org_name,
            intended_use=intended_use,
            approval_status=approval_status,
            org_role=org_role,
        )
        self._session.add(user)
        await self._session.flush()
        return user

    async def get_by_email(self, tenant_id: UUID, email: str) -> User | None:
        """Return the user with the given email within a tenant, or None."""
        result = await self._session.scalars(
            select(User).where(
                User.tenant_id == tenant_id,
                User.email == email,
            )
        )
        return result.first()

    async def get_by_id(self, tenant_id: UUID, user_id: UUID) -> User | None:
        """Return the user with the given ID within a tenant, or None."""
        result = await self._session.scalars(
            select(User).where(
                User.tenant_id == tenant_id,
                User.id == user_id,
            )
        )
        return result.first()

    async def list_by_status(
        self,
        tenant_id: UUID,
        approval_status: UserApprovalStatus,
    ) -> list[User]:
        """Return all users with the given approval status, newest first."""
        result = await self._session.scalars(
            select(User)
            .where(
                User.tenant_id == tenant_id,
                User.approval_status == approval_status,
            )
            .order_by(User.created_at.desc())
        )
        return list(result.all())

    async def set_approval_status(
        self,
        tenant_id: UUID,
        user_id: UUID,
        status: UserApprovalStatus,
    ) -> bool:
        """Set a user's approval status (and match is_active); False if missing."""
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            update(User)
            .where(
                User.tenant_id == tenant_id,
                User.id == user_id,
            )
            .values(
                approval_status=status,
                is_active=status == UserApprovalStatus.APPROVED,
            )
        )
        return cursor.rowcount > 0

    async def set_platform_admin(
        self,
        tenant_id: UUID,
        user_id: UUID,
        flag: bool,
    ) -> bool:
        """Set a user's platform-admin flag; False if the user is missing."""
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            update(User)
            .where(
                User.tenant_id == tenant_id,
                User.id == user_id,
            )
            .values(is_platform_admin=flag)
        )
        return cursor.rowcount > 0
