"""Administrative RBAC for human dashboard users (separate from agent/tool-call RBAC).

This module handles human-user permissions for dashboard operations:
- Creating/managing teams
- Inviting/removing members
- Registering servers
- Managing RBAC rules
- Viewing billing/audit logs
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from app.models.orm import OrgMemberRole

if TYPE_CHECKING:
    from app.models.orm import OrgMember


class AdminAction(StrEnum):
    """Administrative actions that can be controlled via RBAC."""

    # Platform-level operations (enforced via platform_admin_subject, not the
    # org-member matrix below — listed here so the action name is a first-class
    # constant used in audit + endpoint metadata).
    PROVISION_TENANT = "provision_tenant"

    # Organization management
    DELETE_ORG = "delete_org"
    RENAME_ORG = "rename_org"
    MANAGE_BILLING = "manage_billing"

    # Member management
    INVITE_ORG_ADMIN = "invite_org_admin"
    INVITE_DEVELOPER = "invite_developer"
    INVITE_TEAM_MEMBER = "invite_team_member"
    INVITE_VIEWER = "invite_viewer"
    INVITE_AUDITOR = "invite_auditor"
    INVITE_BILLING_ADMIN = "invite_billing_admin"
    REMOVE_ORG_ADMIN = "remove_org_admin"
    REMOVE_DEVELOPER = "remove_developer"
    REMOVE_TEAM_MEMBER = "remove_team_member"
    REMOVE_VIEWER = "remove_viewer"
    REMOVE_AUDITOR = "remove_auditor"
    REMOVE_BILLING_ADMIN = "remove_billing_admin"

    # Team management
    CREATE_TEAM = "create_team"
    DELETE_TEAM = "delete_team"
    ASSIGN_SERVERS_TO_TEAM = "assign_servers_to_team"
    UNASSIGN_SERVERS_FROM_TEAM = "unassign_servers_from_team"

    # Server management
    REGISTER_SERVER = "register_server"
    UPDATE_SERVER = "update_server"
    DELETE_SERVER = "delete_server"

    # RBAC rule management
    CREATE_RBAC_RULE = "create_rbac_rule"
    UPDATE_RBAC_RULE = "update_rbac_rule"
    DELETE_RBAC_RULE = "delete_rbac_rule"

    # API key management
    ISSUE_ORG_API_KEY = "issue_org_api_key"
    REVOKE_ORG_API_KEY = "revoke_org_api_key"
    ISSUE_OWN_API_KEY = "issue_own_api_key"

    # Audit/log access
    VIEW_AUDIT_LOG = "view_audit_log"
    VIEW_SERVER_HEALTH = "view_server_health"

    # API key management (own)
    VIEW_OWN_API_KEYS = "view_own_api_keys"
    REVOKE_OWN_API_KEY = "revoke_own_api_key"


# Role hierarchy (higher = more permissions)
_ROLE_HIERARCHY: dict[OrgMemberRole, int] = {
    OrgMemberRole.ORG_OWNER: 100,
    OrgMemberRole.ORG_ADMIN: 80,
    OrgMemberRole.DEVELOPER: 60,
    OrgMemberRole.TEAM_MEMBER: 50,
    OrgMemberRole.VIEWER: 30,
    OrgMemberRole.AUDITOR: 40,  # Special: read-only but org-wide
    OrgMemberRole.BILLING_ADMIN: 20,  # Special: billing only
}


# Permission matrix: role -> allowed actions
_ROLE_PERMISSIONS: dict[OrgMemberRole, set[AdminAction]] = {
    OrgMemberRole.ORG_OWNER: {
        # Organization management
        AdminAction.DELETE_ORG,
        AdminAction.RENAME_ORG,
        AdminAction.MANAGE_BILLING,
        # Member management
        AdminAction.INVITE_ORG_ADMIN,
        AdminAction.INVITE_DEVELOPER,
        AdminAction.INVITE_TEAM_MEMBER,
        AdminAction.INVITE_VIEWER,
        AdminAction.INVITE_AUDITOR,
        AdminAction.INVITE_BILLING_ADMIN,
        AdminAction.REMOVE_ORG_ADMIN,
        AdminAction.REMOVE_DEVELOPER,
        AdminAction.REMOVE_TEAM_MEMBER,
        AdminAction.REMOVE_VIEWER,
        AdminAction.REMOVE_AUDITOR,
        AdminAction.REMOVE_BILLING_ADMIN,
        # Team management
        AdminAction.CREATE_TEAM,
        AdminAction.DELETE_TEAM,
        AdminAction.ASSIGN_SERVERS_TO_TEAM,
        AdminAction.UNASSIGN_SERVERS_FROM_TEAM,
        # Server management
        AdminAction.REGISTER_SERVER,
        AdminAction.UPDATE_SERVER,
        AdminAction.DELETE_SERVER,
        # RBAC rule management
        AdminAction.CREATE_RBAC_RULE,
        AdminAction.UPDATE_RBAC_RULE,
        AdminAction.DELETE_RBAC_RULE,
        # API key management
        AdminAction.ISSUE_ORG_API_KEY,
        AdminAction.REVOKE_ORG_API_KEY,
        AdminAction.ISSUE_OWN_API_KEY,
        # Audit/log access
        AdminAction.VIEW_AUDIT_LOG,
        AdminAction.VIEW_SERVER_HEALTH,
        # Own API keys
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
    OrgMemberRole.ORG_ADMIN: {
        # Member management
        AdminAction.INVITE_DEVELOPER,
        AdminAction.INVITE_TEAM_MEMBER,
        AdminAction.INVITE_VIEWER,
        AdminAction.INVITE_AUDITOR,
        AdminAction.REMOVE_DEVELOPER,
        AdminAction.REMOVE_TEAM_MEMBER,
        AdminAction.REMOVE_VIEWER,
        AdminAction.REMOVE_AUDITOR,
        # Team management
        AdminAction.CREATE_TEAM,
        AdminAction.DELETE_TEAM,
        AdminAction.ASSIGN_SERVERS_TO_TEAM,
        AdminAction.UNASSIGN_SERVERS_FROM_TEAM,
        # Server management
        AdminAction.REGISTER_SERVER,
        AdminAction.UPDATE_SERVER,
        AdminAction.DELETE_SERVER,
        # RBAC rule management
        AdminAction.CREATE_RBAC_RULE,
        AdminAction.UPDATE_RBAC_RULE,
        AdminAction.DELETE_RBAC_RULE,
        # API key management
        AdminAction.ISSUE_ORG_API_KEY,
        AdminAction.REVOKE_ORG_API_KEY,
        AdminAction.ISSUE_OWN_API_KEY,
        # Audit/log access
        AdminAction.VIEW_AUDIT_LOG,
        AdminAction.VIEW_SERVER_HEALTH,
        # Own API keys
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
    OrgMemberRole.DEVELOPER: {
        # Server management (within team scope)
        AdminAction.REGISTER_SERVER,
        AdminAction.UPDATE_SERVER,
        AdminAction.DELETE_SERVER,
        # RBAC rule management (within team scope)
        AdminAction.CREATE_RBAC_RULE,
        AdminAction.UPDATE_RBAC_RULE,
        AdminAction.DELETE_RBAC_RULE,
        # API key management (own only)
        AdminAction.ISSUE_OWN_API_KEY,
        # Audit/log access
        AdminAction.VIEW_AUDIT_LOG,
        AdminAction.VIEW_SERVER_HEALTH,
        # Own API keys
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
    OrgMemberRole.TEAM_MEMBER: {
        # Server management (within team scope)
        AdminAction.REGISTER_SERVER,
        AdminAction.UPDATE_SERVER,
        AdminAction.DELETE_SERVER,
        # RBAC rule management (within team scope)
        AdminAction.CREATE_RBAC_RULE,
        AdminAction.UPDATE_RBAC_RULE,
        AdminAction.DELETE_RBAC_RULE,
        # API key management (own only)
        AdminAction.ISSUE_OWN_API_KEY,
        # Audit/log access
        AdminAction.VIEW_AUDIT_LOG,
        AdminAction.VIEW_SERVER_HEALTH,
        # Own API keys
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
    OrgMemberRole.VIEWER: {
        # Read-only access
        AdminAction.VIEW_AUDIT_LOG,
        AdminAction.VIEW_SERVER_HEALTH,
        # Own API keys (read/revoke only)
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
    OrgMemberRole.AUDITOR: {
        # Read-only org-wide
        AdminAction.VIEW_AUDIT_LOG,
        AdminAction.VIEW_SERVER_HEALTH,
        # Own API keys
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
    OrgMemberRole.BILLING_ADMIN: {
        # Billing only
        AdminAction.MANAGE_BILLING,
        # Own API keys
        AdminAction.VIEW_OWN_API_KEYS,
        AdminAction.REVOKE_OWN_API_KEY,
    },
}


@dataclass(frozen=True)
class AdminPermissionDecision:
    """Immutable result of an administrative permission evaluation."""

    allowed: bool
    reason: str


def get_role_level(role: OrgMemberRole) -> int:
    """Get the hierarchy level for a role (higher = more permissions)."""
    return _ROLE_HIERARCHY.get(role, 0)


def has_permission(member: OrgMember, action: AdminAction) -> AdminPermissionDecision:
    """Check if a member has permission to perform an action.

    This is the main entry point for checking administrative permissions.
    For team-scoped roles (developer, team_member, viewer), additional
    team-scoping logic should be applied by the caller.
    """
    allowed_actions = _ROLE_PERMISSIONS.get(member.admin_role, set())

    if action in allowed_actions:
        return AdminPermissionDecision(allowed=True, reason=f"allowed by role {member.admin_role}")

    return AdminPermissionDecision(
        allowed=False, reason=f"action {action} not allowed for role {member.admin_role}"
    )


def can_manage_member(manager: OrgMember, target: OrgMember) -> bool:
    """Check if a manager can manage (invite/remove/change role) a target member."""
    # Can't manage yourself
    if manager.id == target.id:
        return False

    # Org owners can manage everyone except other org_owners
    if manager.admin_role == OrgMemberRole.ORG_OWNER:
        return target.admin_role != OrgMemberRole.ORG_OWNER

    # Org admins can manage developers, team_members, viewers, auditors, billing_admins
    if manager.admin_role == OrgMemberRole.ORG_ADMIN:
        return target.admin_role in {
            OrgMemberRole.DEVELOPER,
            OrgMemberRole.TEAM_MEMBER,
            OrgMemberRole.VIEWER,
            OrgMemberRole.AUDITOR,
            OrgMemberRole.BILLING_ADMIN,
        }

    # Developers/team_members/viewers/auditors/billing_admins can't manage others
    return False


def can_invite_role(inviter: OrgMember, role: OrgMemberRole) -> bool:
    """Check if a member can invite someone with a specific role."""
    if inviter.admin_role == OrgMemberRole.ORG_OWNER:
        # Owners can invite anyone except other owners
        return role != OrgMemberRole.ORG_OWNER

    if inviter.admin_role == OrgMemberRole.ORG_ADMIN:
        # Admins can invite developers, team_members, viewers, auditors, billing_admins
        return role in {
            OrgMemberRole.DEVELOPER,
            OrgMemberRole.TEAM_MEMBER,
            OrgMemberRole.VIEWER,
            OrgMemberRole.AUDITOR,
            OrgMemberRole.BILLING_ADMIN,
        }

    # Others can't invite anyone
    return False


def can_access_team_scope(member: OrgMember, team_id: UUID | None) -> bool:
    """Check if a member can access a specific team's resources.

    - Org-wide roles (owner, admin, auditor, billing_admin) can access all teams
    - Team-scoped roles (developer, team_member, viewer) only their assigned team
    """
    if member.admin_role in {
        OrgMemberRole.ORG_OWNER,
        OrgMemberRole.ORG_ADMIN,
        OrgMemberRole.AUDITOR,
        OrgMemberRole.BILLING_ADMIN,
    }:
        return True

    # Team-scoped roles: must match their assigned team
    return member.team_id == team_id


def get_effective_permissions(member: OrgMember) -> set[AdminAction]:
    """Get all permissions for a member (for debugging/UI)."""
    return _ROLE_PERMISSIONS.get(member.admin_role, set()).copy()


# Type imports at bottom to avoid circular imports
