"""SQLAlchemy persistence model boundary."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    MetaData,
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
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

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


class PermissionEffect(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class RateLimitAlgorithm(StrEnum):
    TOKEN_BUCKET = "token_bucket"
    SLIDING_WINDOW = "sliding_window"


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
    subject_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("api_keys.id", ondelete="CASCADE"),
        index=True,
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
