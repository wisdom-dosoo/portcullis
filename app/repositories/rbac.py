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
        result = await self._session.scalars(
            select(Role).where(Role.tenant_id == tenant_id)
        )
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

    # ------------------------------------------------------------------
    # Role bindings
    # ------------------------------------------------------------------

    async def create_binding(self, role_id: UUID, subject_id: UUID) -> RoleBinding:
        """Bind an API key (subject) to a role."""
        binding = RoleBinding(
            role_id=role_id,
            subject_type=SubjectType.API_KEY,
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

    async def get_permissions_for_subject(self, subject_id: UUID) -> list[ToolPermission]:
        """Return all tool permissions that apply to the given API key subject.

        Join chain:
        ``api_keys.id → role_bindings.subject_id → roles.id → tool_permissions.role_id``

        Only bindings with ``subject_type == 'api_key'`` are considered.
        """
        result = await self._session.scalars(
            select(ToolPermission)
            .join(Role, ToolPermission.role_id == Role.id)
            .join(
                RoleBinding,
                (RoleBinding.role_id == Role.id)
                & (RoleBinding.subject_id == subject_id)
                & (RoleBinding.subject_type == SubjectType.API_KEY),
            )
        )
        return list(result.all())
