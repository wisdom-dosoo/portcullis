"""Pydantic request and response schema boundary."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.orm import (
    AuditEventType,
    InvitationStatus,
    LicensePlan,
    LicenseStatus,
    OrgMemberRole,
    OrgRole,
    PermissionEffect,
    RateLimitAlgorithm,
    ServerAuthMode,
    ServerStatus,
    ServerTransport,
    SubjectType,
    UserApprovalStatus,
)

_SLUG_ALLOWED = re.compile(r"^[a-z0-9-]+$")


def _normalize_slug(value: str) -> str:
    """Normalize a slug to lowercase hyphen-separated form."""
    # Lowercase
    slug = value.lower()
    # Replace spaces with hyphens
    slug = slug.replace(" ", "-")
    # Remove any character that is not [a-z0-9-]
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    # Strip leading/trailing hyphens
    slug = slug.strip("-")
    return slug


class ServerCreate(BaseModel):
    """Schema for creating a new MCP server registration."""

    name: str
    slug: str
    upstream_url: str
    transport: ServerTransport = ServerTransport.STREAMABLE_HTTP
    auth_mode: ServerAuthMode = ServerAuthMode.NONE
    service_token_env_var: str | None = None
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None
    health_check_path: str = "/health"

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("slug must contain at least one alphanumeric character")
        if not _SLUG_ALLOWED.match(normalized):
            raise ValueError("slug may only contain lowercase letters, digits, and hyphens")
        return normalized


class ServerUpdate(BaseModel):
    """Schema for updating an existing MCP server registration (all fields optional)."""

    name: str | None = None
    slug: str | None = None
    upstream_url: str | None = None
    transport: ServerTransport | None = None
    auth_mode: ServerAuthMode | None = None
    service_token_env_var: str | None = None
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None
    health_check_path: str | None = None
    status: ServerStatus | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("slug must contain at least one alphanumeric character")
        if not _SLUG_ALLOWED.match(normalized):
            raise ValueError("slug may only contain lowercase letters, digits, and hyphens")
        return normalized


def _normalize_email(value: str) -> str:
    """Normalize an email address to lowercase trimmed form."""
    return value.strip().lower()


class RegisterRequest(BaseModel):
    """Schema for creating a new user account.

    ``flow`` distinguishes the three registration paths:
      * create      — start a new org; ``org_name`` set → approved.
      * join        — request access to an existing org; created ``pending``
                      for an admin to approve.
      * invitation  — redeem an admin-issued ``invite_code`` → approved and
                      bound to the invite's org.
    """

    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)
    flow: Literal["create", "join", "invitation"] = "create"
    org_name: str | None = Field(default=None, max_length=200)
    intended_use: str | None = Field(default=None, max_length=200)
    invite_code: str | None = Field(default=None, max_length=200)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _normalize_email(value)


class LoginRequest(BaseModel):
    """Schema for authenticating an existing user."""

    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _normalize_email(value)


class UserView(BaseModel):
    """Safe response schema for a user — never exposes password_hash.

    ``access_token`` is present only on the admin approval response.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    org_name: str | None
    intended_use: str | None
    is_active: bool
    approval_status: UserApprovalStatus
    is_platform_admin: bool = False
    org_role: OrgRole | None = None
    created_at: datetime
    updated_at: datetime
    access_token: str | None = None


class PlatformAdminMe(BaseModel):
    """Response for the platform-admin introspection endpoint."""

    is_platform_admin: bool
    user: UserView


class AuthResponse(BaseModel):
    """Response returned on successful register/login — includes one-time token."""

    access_token: str
    token_type: str = "bearer"
    user: UserView


class InviteCreate(BaseModel):
    """Schema for an admin minting a new invitation code."""

    org_name: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)
    role: OrgRole = OrgRole.DEVELOPER

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _normalize_email(value)


class InviteView(BaseModel):
    """View of an invitation — never exposes the code hash.

    ``code`` holds the one-time plaintext and is present only in the single
    mint response.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_name: str
    email: str | None
    status: InvitationStatus
    role: OrgRole
    redeemed_by: UUID | None
    redeemed_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    code: str | None = None


class InviteRedeemResponse(BaseModel):
    """Response returned when an invitation code is minted or validated."""

    id: UUID
    org_name: str


class ApprovalDecision(BaseModel):
    """Schema for an admin approving or rejecting a pending join request."""

    user_id: UUID


class ApiKeyCreate(BaseModel):
    """Schema for creating a new API key."""

    name: str
    scopes: list[str] = []


class ApiKeyView(BaseModel):
    """Safe response schema for API key data — no hash, no plaintext."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    created_at: datetime
    last_used_at: datetime | None


class ApiKeyCreateResponse(BaseModel):
    """Response returned only at creation — includes one-time plaintext."""

    key: ApiKeyView
    plaintext: str


class RoleCreate(BaseModel):
    """Schema for creating a new role."""

    name: str


class RoleView(BaseModel):
    """Safe response schema for a role."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


class RoleBindingCreate(BaseModel):
    """Schema for binding a subject to a role.

    Use ``subject_type=api_key`` (default) with a UUID string for API keys,
    or ``subject_type=oauth_subject`` with a JWT ``sub`` claim string.
    """

    subject_id: str
    subject_type: SubjectType = SubjectType.API_KEY


class RoleBindingView(BaseModel):
    """Safe response schema for a role binding."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role_id: UUID
    subject_type: SubjectType
    subject_id: str
    created_at: datetime


class ToolPermissionCreate(BaseModel):
    """Schema for creating a tool permission rule on a role."""

    server_pattern: str
    tool_pattern: str
    effect: PermissionEffect
    priority: int = 0


class ToolPermissionView(BaseModel):
    """Safe response schema for a tool permission rule."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role_id: UUID
    server_pattern: str
    tool_pattern: str
    effect: PermissionEffect
    priority: int
    created_at: datetime


class ServerView(BaseModel):
    """Safe response schema for MCP server data (never exposes service_token_env_var)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    slug: str
    upstream_url: str
    transport: ServerTransport
    auth_mode: ServerAuthMode
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None
    status: ServerStatus
    health_check_path: str
    consecutive_health_failures: int
    last_health_check_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RateLimitPolicyCreate(BaseModel):
    """Schema for creating a new rate-limit policy."""

    subject_id: str | None = None
    subject_type: SubjectType = SubjectType.API_KEY
    server_pattern: str | None = None
    tool_pattern: str | None = None
    algorithm: RateLimitAlgorithm
    request_limit: int = Field(gt=0)
    window_seconds: int = Field(gt=0)
    burst_capacity: int | None = Field(default=None, gt=0)
    priority: int = 0


class RateLimitPolicyUpdate(BaseModel):
    """Schema for updating an existing rate-limit policy (all fields optional)."""

    request_limit: int | None = Field(default=None, gt=0)
    window_seconds: int | None = Field(default=None, gt=0)
    burst_capacity: int | None = Field(default=None, gt=0)
    priority: int | None = None


class RateLimitPolicyView(BaseModel):
    """Safe response schema for a rate-limit policy."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    subject_id: str | None
    subject_type: SubjectType | None
    server_pattern: str | None
    tool_pattern: str | None
    algorithm: RateLimitAlgorithm
    request_limit: int
    window_seconds: int
    burst_capacity: int | None
    priority: int
    created_at: datetime
    updated_at: datetime


class AuditLogView(BaseModel):
    """Response schema for a single audit log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None
    subject_id: str | None
    subject_type: SubjectType | None
    event_type: AuditEventType
    server_slug: str | None
    tool_name: str | None
    rpc_method: str | None
    outcome: str
    client_ip: str | None
    request_id: str | None
    detail: dict
    created_at: datetime


class LicenseCreate(BaseModel):
    """Schema for issuing a platform license (platform admin only)."""

    plan: LicensePlan
    licensee: str
    seat_limit: int = Field(gt=0)
    server_limit: int | None = Field(default=None, gt=0)
    expires_in_days: int = Field(gt=0, le=3650)


class LicenseView(BaseModel):
    """Safe response schema for a platform license.

    Never exposes ``key_hash`` or the license key itself; the plaintext key is
    returned only once at issue time via ``LicenseIssueResponse``.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan: LicensePlan
    status: LicenseStatus
    seat_limit: int
    server_limit: int | None
    issued_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    licensee: str
    created_at: datetime
    updated_at: datetime


class LicenseIssueResponse(BaseModel):
    """Issue response containing the one-time plaintext license key."""

    license: LicenseView
    key: str


class LicenseUsageView(LicenseView):
    """License entitlements plus live usage counts for the tenant.

    ``seats_used`` counts the tenant's org-member rows; ``servers_used``
    counts registered MCP servers.  Both are computed at read time.
    """

    seats_used: int = 0
    servers_used: int = 0


class UsageTotalsView(BaseModel):
    """Summed usage counters for a tenant over a period."""

    requests: int = 0
    tool_calls: int = 0
    rbac_denials: int = 0
    rate_limit_rejections: int = 0


class UsageView(UsageTotalsView):
    """Usage counters plus the plan context for billing-tier display."""

    period_start: date
    period_end: date
    plan: LicensePlan | None = None
    monthly_request_cap: int = 0
    enforcement_enabled: bool = False


class TenantView(BaseModel):
    """Safe response schema for a tenant."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    created_at: datetime
    plan: LicensePlan | None = None


class TenantProvisionRequest(BaseModel):
    """Schema for provisioning a new managed tenant (platform admin only).

    The owner account is created approved with the ``org_owner`` role, and a
    platform license is issued for the tenant.  ``owner_password`` is optional —
    when omitted the provisioning service generates one and returns it once.
    """

    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100)
    owner_email: str = Field(min_length=3, max_length=320)
    owner_full_name: str = Field(min_length=1, max_length=200)
    owner_password: str | None = Field(default=None, min_length=8, max_length=200)
    plan: LicensePlan = LicensePlan.PRO
    licensee: str | None = Field(default=None, max_length=300)
    seat_limit: int = Field(default=5, gt=0)
    server_limit: int | None = Field(default=None, gt=0)
    expires_in_days: int = Field(default=365, gt=0, le=3650)

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = _normalize_slug(value)
        if not _SLUG_ALLOWED.match(normalized):
            raise ValueError("slug may only contain lowercase letters, digits, and hyphens")
        return normalized

    @field_validator("owner_email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _normalize_email(value)


class TenantProvisionResponse(BaseModel):
    """Provisioning result containing one-time credentials and the license key."""

    tenant: TenantView
    owner: UserView
    access_token: str
    owner_password: str | None = None
    license: LicenseView
    license_key: str


class TeamCreate(BaseModel):
    """Schema for creating a new team."""
    name: str = Field(min_length=1, max_length=200)


class TeamUpdate(BaseModel):
    """Schema for updating an existing team (all fields optional)."""
    name: str | None = Field(default=None, min_length=1, max_length=200)


class TeamView(BaseModel):
    """Safe response schema for a team."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    server_ids: list[UUID] = Field(default_factory=list)


class OrgMemberCreate(BaseModel):
    """Schema for inviting/adding a new org member."""
    user_subject: str = Field(min_length=1, max_length=500)
    admin_role: OrgMemberRole = OrgMemberRole.DEVELOPER
    team_id: UUID | None = None


class OrgMemberUpdate(BaseModel):
    """Schema for updating an org member (all fields optional)."""
    admin_role: OrgMemberRole | None = None
    team_id: UUID | None = None


class OrgMemberView(BaseModel):
    """Safe response schema for an org member."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    tenant_id: UUID
    user_subject: str
    admin_role: OrgMemberRole
    team_id: UUID | None
    created_at: datetime
    updated_at: datetime


class InstanceHeartbeatRequest(BaseModel):
    """Anonymous self-host heartbeat payload.

    ``install_id`` is the install's persistent identifier (generated on first
    boot and kept in its local config); ``version`` is the running Portcullis
    version and ``server_count`` the number of registered MCP servers.  The
    payload deliberately contains no tenant or user data.
    """

    install_id: UUID
    version: str = Field(min_length=1, max_length=64)
    server_count: int = Field(default=0, ge=0)


class InstanceView(BaseModel):
    """Safe response schema for a known self-host install."""

    model_config = ConfigDict(from_attributes=True)

    install_id: UUID
    version: str
    server_count: int
    first_seen_at: datetime
    last_seen_at: datetime


class InstanceSummaryView(BaseModel):
    """Aggregate install counts for the Phase 4 self-host funnel review."""

    total: int
    active_24h: int
