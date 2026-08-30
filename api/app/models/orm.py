"""SQLAlchemy persistence model boundary."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    MetaData,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
    func,
)
from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def _enum_values(enum_type: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_type]


class ServerTransport(StrEnum):
    STREAMABLE_HTTP = "streamable_http"


class ServerAuthMode(StrEnum):
    NONE = "none"
    SERVICE_TOKEN = "service_token"


class ServerStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    UNHEALTHY = "unhealthy"


class ApiKeyScope(StrEnum):
    ADMIN = "admin"


class SubjectType(StrEnum):
    API_KEY = "api_key"
    OAUTH_SUBJECT = "oauth_subject"


class UserApprovalStatus(StrEnum):
    """Lifecycle state of a user account.

    ``approved``  — account active, can authenticate.
    ``pending``   — created via an org join request, waiting for an admin.
    ``rejected``  — join request denied by an admin.
    """

    APPROVED = "approved"
    PENDING = "pending"
    REJECTED = "rejected"


class InvitationStatus(StrEnum):
    """Lifecycle state of an invitation code.

    ``active``   — redeemable (not used, not revoked, not expired).
    ``used``     — a user has already redeemed it (single use).
    ``revoked``  — an admin invalidated it.
    ``expired``  — past its expires_at timestamp.
    """

    ACTIVE = "active"
    USED = "used"
    REVOKED = "revoked"
    EXPIRED = "expired"


class OrgRole(StrEnum):
    """Organization-level roles for RBAC.

    Hierarchy (highest to lowest):
    - org_owner: Full org control (manage users, roles, servers, billing, delete org)
    - org_admin: Manage users, servers, policies, audit logs
    - developer: Manage servers, tools, rate limits, view audit
    - viewer: Read-only access to servers, tools, audit logs
    """

    ORG_OWNER = "org_owner"
    ORG_ADMIN = "org_admin"
    DEVELOPER = "developer"
    VIEWER = "viewer"


class PermissionEffect(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class OrgMemberRole(StrEnum):
    """Administrative dashboard roles for human users (NOT agent subjects).

    Hierarchy (highest to lowest):
    - org_owner: Full org control (billing, delete org, manage all users/roles/servers)
    - org_admin: Everything operational — servers, RBAC, API keys, members — minus billing/org deletion
    - developer: Manage servers, tools, rate limits, view audit (within their team)
    - team_member: Same as developer but cannot create teams or invite members
    - viewer: Read-only access to servers, tools, audit logs
    - auditor: Full org-wide audit-log + RBAC-rule read access, can't see API key secrets or change anything
    - billing_admin: Payment method, invoices, seat count. Zero access to servers/RBAC/audit.
    """

    ORG_OWNER = "org_owner"
    ORG_ADMIN = "org_admin"
    DEVELOPER = "developer"
    TEAM_MEMBER = "team_member"
    VIEWER = "viewer"
    AUDITOR = "auditor"
    BILLING_ADMIN = "billing_admin"


class RateLimitAlgorithm(StrEnum):
    TOKEN_BUCKET = "token_bucket"
    SLIDING_WINDOW = "sliding_window"


class LicensePlan(StrEnum):
    """Commercial plan tiers for the platform license."""

    COMMUNITY = "community"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class LicenseStatus(StrEnum):
    """Lifecycle state of a platform license.

    ``active``   — valid and in force (not expired, not revoked).
    ``expired``  — past its expires_at timestamp.
    ``revoked``  — invalidated by a platform admin.
    """

    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


class Base(DeclarativeBase):
    """Declarative base with deterministic migration constraint names."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UuidPrimaryKeyMixin:
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        # Client-side onupdate avoids the MissingGreenlet error: after a server-side
        # func.now() the attribute is expired and requires an async refresh before
        # Pydantic can serialize it.  A Python lambda keeps the value in memory.
        onupdate=lambda: datetime.now(UTC),
    )


class Tenant(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # Super admin who created this organization
    created_by_super_admin_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Super admins who have access to this organization
    super_admins: Mapped[list[User]] = relationship(
        "User",
        secondary="super_admin_organizations",
        back_populates="created_organizations",
        lazy="selectin",
    )
    # Teams within this tenant
    teams: Mapped[list[Team]] = relationship(
        "Team",
        back_populates="tenant",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    # Org members (human dashboard users)
    org_members: Mapped[list[OrgMember]] = relationship(
        "OrgMember",
        back_populates="tenant",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class McpServer(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug"),
        CheckConstraint(
            "consecutive_health_failures >= 0",
            name="non_negative_health_failures",
        ),
        CheckConstraint(
            "auth_mode != 'service_token' OR service_token_env_var IS NOT NULL",
            name="service_token_env_required",
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    upstream_url: Mapped[str] = mapped_column(Text, nullable=False)
    transport: Mapped[ServerTransport] = mapped_column(
        SqlEnum(
            ServerTransport,
            name="server_transport",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=ServerTransport.STREAMABLE_HTTP,
    )
    auth_mode: Mapped[ServerAuthMode] = mapped_column(
        SqlEnum(
            ServerAuthMode,
            name="server_auth_mode",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=ServerAuthMode.NONE,
    )
    service_token_env_var: Mapped[str | None] = mapped_column(String(200))
    # mTLS configuration for upstream connections
    ssl_ca: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssl_cert: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssl_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ServerStatus] = mapped_column(
        SqlEnum(
            ServerStatus,
            name="server_status",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=ServerStatus.ACTIVE,
    )
    health_check_path: Mapped[str] = mapped_column(String(500), nullable=False, default="/health")
    consecutive_health_failures: Mapped[int] = mapped_column(nullable=False, default=0)
    last_health_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Teams that have access to this server
    teams: Mapped[list[Team]] = relationship(
        "Team",
        secondary="team_servers",
        back_populates="servers",
        lazy="selectin",
    )


class User(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email"),)

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    org_name: Mapped[str | None] = mapped_column(String(200))
    intended_use: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    is_platform_admin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    org_role: Mapped[OrgRole | None] = mapped_column(
        SqlEnum(
            OrgRole,
            name="org_role",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=True,
        index=True,
    )
    # Super admin organization tracking
    created_org_count: Mapped[int] = mapped_column(nullable=False, default=0)
    approval_status: Mapped[UserApprovalStatus] = mapped_column(
        SqlEnum(
            UserApprovalStatus,
            name="user_approval_status",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=UserApprovalStatus.APPROVED,
    )
    # Relationships
    created_organizations: Mapped[list[Tenant]] = relationship(
        "Tenant",
        secondary="super_admin_organizations",
        back_populates="super_admins",
        lazy="selectin",
    )


class SuperAdminOrganization(CreatedAtMixin, Base):
    """Join table linking super admins to organizations they created/manage."""

    __tablename__ = "super_admin_organizations"

    super_admin_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    organization_tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )


class Team(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    """A team within a tenant — groups servers and members."""

    __tablename__ = "teams"

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Relationships
    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="teams")
    servers: Mapped[list[McpServer]] = relationship(
        "McpServer",
        secondary="team_servers",
        back_populates="teams",
        lazy="selectin",
    )
    members: Mapped[list[OrgMember]] = relationship(
        "OrgMember",
        back_populates="team",
        lazy="selectin",
    )

    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_teams_tenant_name"),)


class TeamServer(CreatedAtMixin, Base):
    """Many-to-many linking teams to MCP servers."""

    __tablename__ = "team_servers"

    team_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    server_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("mcp_servers.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )

    __table_args__ = (PrimaryKeyConstraint("team_id", "server_id", name="pk_team_servers"),)


class OrgMember(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    """Human dashboard user (NOT agent subject) with an administrative role."""

    __tablename__ = "org_members"

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # OAuth 'sub' claim or other stable identifier for the human
    user_subject: Mapped[str] = mapped_column(Text, nullable=False)
    admin_role: Mapped[OrgMemberRole] = mapped_column(
        SqlEnum(
            OrgMemberRole,
            name="org_member_role",
            values_callable=_enum_values,
            validate_strings=True,
            native_enum=False,
            create_constraint=False,
        ),
        nullable=False,
    )
    # NULL = org-wide role; set = team-scoped role
    team_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Relationships
    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="org_members")
    team: Mapped[Team | None] = relationship("Team", back_populates="members")

    __table_args__ = (
        UniqueConstraint("tenant_id", "user_subject", name="uq_org_members_tenant_subject"),
    )


class Invitation(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    """One-time invite code granting access to an organization.

    The code itself is never stored — only an HMAC-SHA256 hash keyed by the
    server pepper.  Redeeming verifies the code, binds the registering user to
    the invitation, and marks it used.
    """

    __tablename__ = "invitations"

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    org_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[OrgRole] = mapped_column(
        SqlEnum(
            OrgRole,
            name="org_role",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=OrgRole.DEVELOPER,
    )
    status: Mapped[InvitationStatus] = mapped_column(
        SqlEnum(
            InvitationStatus,
            name="invitation_status",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=InvitationStatus.ACTIVE,
    )
    redeemed_by: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApiKey(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "api_keys"

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Role(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class RoleBinding(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "role_bindings"
    __table_args__ = (UniqueConstraint("role_id", "subject_type", "subject_id"),)

    role_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_type: Mapped[SubjectType] = mapped_column(
        SqlEnum(
            SubjectType,
            name="subject_type",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=SubjectType.API_KEY,
    )
    # TEXT (not UUID FK) so both API-key UUIDs and OAuth sub claims can be stored.
    # The FK to api_keys.id was dropped in migration 0002.
    subject_id: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        index=True,
    )


class ToolPermission(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "tool_permissions"

    role_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    server_pattern: Mapped[str] = mapped_column(String(200), nullable=False)
    tool_pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    effect: Mapped[PermissionEffect] = mapped_column(
        SqlEnum(
            PermissionEffect,
            name="permission_effect",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(nullable=False, default=0)


class AuditEventType(StrEnum):
    AUTH_FAILURE = "auth_failure"
    PLATFORM_ADMIN_GRANTED = "platform_admin_granted"
    RBAC_DENY = "rbac_deny"
    TOOL_CALL = "tool_call"
    TENANT_PROVISIONED = "tenant_provisioned"


class AuditLog(UuidPrimaryKeyMixin, CreatedAtMixin, Base):
    """Immutable audit record written for every significant gateway event."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        # Primary query pattern: per-tenant reverse-chronological listing.
        Index("ix_audit_logs_tenant_created", "tenant_id", "created_at"),
    )

    tenant_id: Mapped[UUID | None] = mapped_column(Uuid)
    subject_id: Mapped[str | None] = mapped_column(String(500))
    subject_type: Mapped[SubjectType | None] = mapped_column(
        SqlEnum(
            SubjectType,
            name="subject_type",
            values_callable=_enum_values,
            validate_strings=True,
            create_constraint=False,  # reuse existing DB enum
        )
    )
    event_type: Mapped[AuditEventType] = mapped_column(
        SqlEnum(
            AuditEventType,
            name="audit_event_type",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    server_slug: Mapped[str | None] = mapped_column(String(200))
    tool_name: Mapped[str | None] = mapped_column(String(500))
    rpc_method: Mapped[str | None] = mapped_column(String(200))
    # "allowed" | "denied" | "error"
    outcome: Mapped[str] = mapped_column(String(50), nullable=False)
    client_ip: Mapped[str | None] = mapped_column(String(100))
    request_id: Mapped[str | None] = mapped_column(String(100))
    # Tamper-evident hash chain (Gap 5): each entry links to previous via prev_hash
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    entry_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Catch-all structured blob for event-specific extra context.
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class RateLimitPolicy(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "rate_limit_policies"
    __table_args__ = (
        CheckConstraint("request_limit > 0", name="positive_request_limit"),
        CheckConstraint("window_seconds > 0", name="positive_window_seconds"),
        CheckConstraint(
            "burst_capacity IS NULL OR burst_capacity > 0",
            name="positive_burst_capacity",
        ),
        CheckConstraint(
            "algorithm != 'token_bucket' OR burst_capacity IS NOT NULL",
            name="token_bucket_burst_required",
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Polymorphic subject_id: stores API key UUID (string) or OAuth sub claim
    subject_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    subject_type: Mapped[SubjectType | None] = mapped_column(
        SqlEnum(
            SubjectType,
            name="subject_type",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=True,
    )
    server_pattern: Mapped[str | None] = mapped_column(String(200))
    tool_pattern: Mapped[str | None] = mapped_column(String(500))
    algorithm: Mapped[RateLimitAlgorithm] = mapped_column(
        SqlEnum(
            RateLimitAlgorithm,
            name="rate_limit_algorithm",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    request_limit: Mapped[int] = mapped_column(nullable=False)
    window_seconds: Mapped[int] = mapped_column(nullable=False)
    burst_capacity: Mapped[int | None] = mapped_column()
    priority: Mapped[int] = mapped_column(nullable=False, default=0)


class License(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """A platform license granting entitlements for a period of time.

    There is at most one active license per tenant.  The license itself is
    signed with a keyed HMAC derived from the server pepper; the raw key is
    never stored — only its hash — so a leaked database cannot forge licenses.
    """

    __tablename__ = "licenses"
    __table_args__ = (
        CheckConstraint("seat_limit > 0", name="positive_seat_limit"),
        CheckConstraint("server_limit IS NULL OR server_limit > 0", name="positive_server_limit"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan: Mapped[LicensePlan] = mapped_column(
        SqlEnum(
            LicensePlan,
            name="license_plan",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )
    status: Mapped[LicenseStatus] = mapped_column(
        SqlEnum(
            LicenseStatus,
            name="license_status",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
        default=LicenseStatus.ACTIVE,
    )
    key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # Entitlements granted by the license.
    seat_limit: Mapped[int] = mapped_column(nullable=False)
    server_limit: Mapped[int | None] = mapped_column()
    # License term.
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Human-readable issuer / licensee metadata.
    licensee: Mapped[str] = mapped_column(String(300), nullable=False)
    issued_by: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )


class UsageDaily(UuidPrimaryKeyMixin, Base):
    """Per-tenant daily usage counters for billing-tier metering.

    One row per (tenant, day).  Counters are incremented from the gateway as
    requests flow through the proxy; the Cloud control plane reads these rows
    to drive usage-based billing tiers, and self-hosted deployments can ignore
    them entirely (metering is always-on but enforcement is config-gated).
    """

    __tablename__ = "usage_daily"
    __table_args__ = (
        UniqueConstraint("tenant_id", "usage_date", name="uq_usage_daily_tenant_date"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    usage_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    # Request and tool-call counts.
    requests: Mapped[int] = mapped_column(nullable=False, default=0)
    tool_calls: Mapped[int] = mapped_column(nullable=False, default=0)
    # Rejection / failure counters (useful for plan dashboards, not billing).
    rbac_denials: Mapped[int] = mapped_column(nullable=False, default=0)
    rate_limit_rejections: Mapped[int] = mapped_column(nullable=False, default=0)


class Instance(UuidPrimaryKeyMixin, Base):
    """Anonymous self-host installation record (opt-in telemetry).

    Each self-hosted install generates a persistent ``install_id`` (kept in
    its local config) and, when ``telemetry_enabled`` is on, reports a
    heartbeat so the operator can count active installs and build the
    self-host -> Cloud conversion funnel described in the Phase 4 strategy
    review.  Deliberately anonymous: no tenant linkage, no user data, and the
    endpoint is config-gated OFF by default.
    """

    __tablename__ = "instances"
    __table_args__ = (UniqueConstraint("install_id", name="uq_instances_install_id"),)

    install_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    # Reported payload: version string + number of registered MCP servers.
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    server_count: Mapped[int] = mapped_column(nullable=False, default=0)
    # Heartbeat bookkeeping.
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
    )
