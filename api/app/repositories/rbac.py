"""RBAC repository for role/binding/permission persistence."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import (
    PermissionEffect,
    Role,
    RoleBinding,
    SubjectType,
    ToolPermission,
)


class RbacRepository:
    """Data access layer for roles, role bindings, and tool permissions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Roles
    # ------------------------------------------------------------------

    async def create_role(self, tenant_id: UUID, name: str) -> Role:
        """Create and persist a new role for the given tenant."""
        role = Role(tenant_id=tenant_id, name=name)
        self._session.add(role)
        await self._session.flush()
        return role

    async def list_roles(self, tenant_id: UUID) -> list[Role]:
        """Return all roles for the given tenant."""
        result = await self._session.scalars(select(Role).where(Role.tenant_id == tenant_id))
        return list(result.all())

    async def get_role(self, tenant_id: UUID, role_id: UUID) -> Role | None:
        """Return a single role by ID scoped to tenant, or None if not found."""
        result = await self._session.scalars(
            select(Role).where(
                Role.id == role_id,
                Role.tenant_id == tenant_id,
            )
        )
        return result.first()

    async def get_role_by_name(self, tenant_id: UUID, name: str) -> Role | None:
        """Return a role by name scoped to tenant, or None if not found."""
        result = await self._session.scalars(
            select(Role).where(
                Role.tenant_id == tenant_id,
                Role.name == name,
            )
        )
        return result.first()

    # ------------------------------------------------------------------
    # Role bindings
    # ------------------------------------------------------------------

    async def create_binding(
        self,
        role_id: UUID,
        subject_id: str,
        subject_type: SubjectType = SubjectType.API_KEY,
    ) -> RoleBinding:
        """Bind a subject (API key or OAuth) to a role."""
        binding = RoleBinding(
            role_id=role_id,
            subject_type=subject_type,
            subject_id=subject_id,
        )
        self._session.add(binding)
        await self._session.flush()
        return binding

    async def delete_binding(self, binding_id: UUID, role_id: UUID) -> bool:
        """Remove a role binding.  Returns True if a row was deleted."""
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            delete(RoleBinding).where(
                RoleBinding.id == binding_id,
                RoleBinding.role_id == role_id,
            )
        )
        return cursor.rowcount > 0

    # ------------------------------------------------------------------
    # Tool permissions
    # ------------------------------------------------------------------

    async def create_permission(
        self,
        role_id: UUID,
        server_pattern: str,
        tool_pattern: str,
        effect: PermissionEffect,
        priority: int,
    ) -> ToolPermission:
        """Attach a tool permission rule to a role."""
        permission = ToolPermission(
            role_id=role_id,
            server_pattern=server_pattern,
            tool_pattern=tool_pattern,
            effect=effect,
            priority=priority,
        )
        self._session.add(permission)
        await self._session.flush()
        return permission

    async def delete_permission(self, permission_id: UUID, role_id: UUID) -> bool:
        """Remove a tool permission.  Returns True if a row was deleted."""
        cursor: CursorResult[tuple[()]] = await self._session.execute(  # type: ignore[assignment]
            delete(ToolPermission).where(
                ToolPermission.id == permission_id,
                ToolPermission.role_id == role_id,
            )
        )
        return cursor.rowcount > 0

    async def get_permission_by_patterns(
        self, role_id: UUID, server_pattern: str, tool_pattern: str
    ) -> ToolPermission | None:
        """Return a permission matching the given role and patterns, or None."""
        result = await self._session.scalars(
            select(ToolPermission).where(
                ToolPermission.role_id == role_id,
                ToolPermission.server_pattern == server_pattern,
                ToolPermission.tool_pattern == tool_pattern,
            )
        )
        return result.first()

    async def get_permissions_for_subject(
        self,
        tenant_id: UUID,
        subject_type: SubjectType,
        subject_id: str,
    ) -> list[ToolPermission]:
        """Return all tool permissions that apply to the given subject.

        Scope is enforced on all three identity dimensions so API-key UUIDs
        and OAuth ``sub`` claims (which share the TEXT subject_id column)
        cannot collide across tenants or identity types.

        Args:
            tenant_id:    Tenant the subject belongs to.
            subject_type: Identity type (API_KEY or OAUTH_SUBJECT).
            subject_id:   Subject string (API-key UUID or JWT sub claim).
        """
        result = await self._session.scalars(
            select(ToolPermission)
            .join(Role, ToolPermission.role_id == Role.id)
            .join(
                RoleBinding,
                (RoleBinding.role_id == Role.id)
                & (Role.tenant_id == tenant_id)
                & (RoleBinding.subject_type == subject_type)
                & (RoleBinding.subject_id == subject_id),
            )
        )
        return list(result.all())
