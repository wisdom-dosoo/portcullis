"""Organization bootstrap helpers shared by registration and provisioning.

These create the default role set and bind an owner's API key to the
``org_owner`` role.  Both the self-service register flow and the platform
provisioning path (CLI + ``/admin/tenants``) build a tenant through the same
helpers so the resulting orgs are structurally identical.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import OrgRole, PermissionEffect, SubjectType
from app.repositories.rbac import RbacRepository


async def create_default_roles(session: AsyncSession, tenant_id: UUID) -> None:
    """Create default org roles with appropriate tool permissions (idempotent).

    Creates five roles:
    - super_admin: Full access except billing (super admin only)
    - org_owner: Full access (all tools, all servers)
    - org_admin: Manage users, servers, policies, audit (no billing/org deletion)
    - developer: Manage servers, tools, rate limits, view audit
    - viewer: Read-only access
    """
    rbac = RbacRepository(session)

    # 1) Create or get roles
    role_super_admin = await _get_or_create_role(rbac, tenant_id, "super_admin")
    role_owner = await _get_or_create_role(rbac, tenant_id, OrgRole.ORG_OWNER.value)
    role_admin = await _get_or_create_role(rbac, tenant_id, OrgRole.ORG_ADMIN.value)
    role_developer = await _get_or_create_role(rbac, tenant_id, OrgRole.DEVELOPER.value)
    role_viewer = await _get_or_create_role(rbac, tenant_id, OrgRole.VIEWER.value)

    # 2) Define tool permissions per role (server_pattern="*", tool_pattern per role)
    # super_admin: all tools on all servers except billing
    await _upsert_permission(rbac, role_super_admin.id, "*", "*", PermissionEffect.ALLOW, priority=200)
    await _upsert_permission(rbac, role_super_admin.id, "*", "billing_*", PermissionEffect.DENY, priority=300)

    # org_owner: all tools on all servers
    await _upsert_permission(rbac, role_owner.id, "*", "*", PermissionEffect.ALLOW, priority=100)

    # org_admin: all tools except billing/org deletion (assume tools prefixed with billing_, org_)
    await _upsert_permission(rbac, role_admin.id, "*", "*", PermissionEffect.ALLOW, priority=50)
    await _upsert_permission(rbac, role_admin.id, "*", "billing_*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_admin.id, "*", "org_delete*", PermissionEffect.DENY, priority=100)

    # developer: server/tool management, rate limits, audit read
    await _upsert_permission(rbac, role_developer.id, "*", "server_*", PermissionEffect.ALLOW, priority=50)
    await _upsert_permission(rbac, role_developer.id, "*", "tool_*", PermissionEffect.ALLOW, priority=50)
    await _upsert_permission(rbac, role_developer.id, "*", "rate_limit_*", PermissionEffect.ALLOW, priority=50)
    await _upsert_permission(rbac, role_developer.id, "*", "audit_*", PermissionEffect.ALLOW, priority=50)
    # Deny billing, org management, user management
    await _upsert_permission(rbac, role_developer.id, "*", "billing_*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_developer.id, "*", "org_*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_developer.id, "*", "user_*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_developer.id, "*", "role_*", PermissionEffect.DENY, priority=100)

    # viewer: read-only access to servers, tools, audit
    await _upsert_permission(rbac, role_viewer.id, "*", "server_list*", PermissionEffect.ALLOW, priority=50)
    await _upsert_permission(rbac, role_viewer.id, "*", "tool_list*", PermissionEffect.ALLOW, priority=50)
    await _upsert_permission(rbac, role_viewer.id, "*", "audit_list*", PermissionEffect.ALLOW, priority=50)
    # Deny all write operations
    await _upsert_permission(rbac, role_viewer.id, "*", "*_create*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_viewer.id, "*", "*_update*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_viewer.id, "*", "*_delete*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_viewer.id, "*", "billing_*", PermissionEffect.DENY, priority=100)
    await _upsert_permission(rbac, role_viewer.id, "*", "org_*", PermissionEffect.DENY, priority=100)


async def _get_or_create_role(rbac: RbacRepository, tenant_id: UUID, name: str):
    """Get existing role or create new one."""
    existing = await rbac.get_role_by_name(tenant_id, name)
    if existing:
        return existing
    return await rbac.create_role(tenant_id, name)


async def _upsert_permission(
    rbac: RbacRepository,
    role_id: UUID,
    server_pattern: str,
    tool_pattern: str,
    effect: PermissionEffect,
    priority: int,
):
    """Create permission if it doesn't already exist (same role_id, server_pattern, tool_pattern)."""
    existing = await rbac.get_permission_by_patterns(role_id, server_pattern, tool_pattern)
    if existing:
        return existing
    return await rbac.create_permission(role_id, server_pattern, tool_pattern, effect, priority)


async def bind_owner_to_org_owner(
    session: AsyncSession,
    tenant_id: UUID,
    api_key_id: UUID,
) -> None:
    """Bind the owner's API key to the org_owner role."""
    rbac = RbacRepository(session)
    # Find the org_owner role
    roles = await rbac.list_roles(tenant_id)
    org_owner_role = next((r for r in roles if r.name == OrgRole.ORG_OWNER.value), None)
    if org_owner_role is None:
        return  # Should not happen if create_default_roles ran
    await rbac.create_binding(
        org_owner_role.id,
        subject_id=str(api_key_id),
        subject_type=SubjectType.API_KEY,
    )