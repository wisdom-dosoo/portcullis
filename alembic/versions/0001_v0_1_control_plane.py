"""Initial control-plane schema with all 7 tables and default-tenant seed.

Revision ID: 0001
Revises:
Create Date: 2026-08-03 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_TENANT_NAME = "Default Tenant"
DEFAULT_TENANT_SLUG = "default"


def upgrade() -> None:
    """Create all control-plane tables, enums, and seed the default tenant."""

    # --- Enums ---
    server_transport = sa.Enum(
        "streamable_http",
        name="server_transport",
    )
    server_auth_mode = sa.Enum(
        "none",
        "service_token",
        name="server_auth_mode",
    )
    server_status = sa.Enum(
        "active",
        "disabled",
        "unhealthy",
        name="server_status",
    )
    subject_type = sa.Enum(
        "api_key",
        name="subject_type",
    )
    permission_effect = sa.Enum(
        "allow",
        "deny",
        name="permission_effect",
    )
    rate_limit_algorithm = sa.Enum(
        "token_bucket",
        "sliding_window",
        name="rate_limit_algorithm",
    )

    # --- tenants ---
    op.create_table(
        "tenants",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "slug",
            sa.String(100),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
        sa.PrimaryKeyConstraint("id", name="pk_tenants"),
    )

    # --- mcp_servers ---
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("upstream_url", sa.Text(), nullable=False),
        sa.Column("transport", server_transport, nullable=False),
        sa.Column("auth_mode", server_auth_mode, nullable=False),
        sa.Column("service_token_env_var", sa.String(200), nullable=True),
        sa.Column("status", server_status, nullable=False),
        sa.Column("health_check_path", sa.String(500), nullable=False),
        sa.Column("consecutive_health_failures", sa.Integer(), nullable=False),
        sa.Column("last_health_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_mcp_servers_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_mcp_servers_tenant_id"),
        sa.CheckConstraint(
            "consecutive_health_failures >= 0",
            name="ck_mcp_servers_non_negative_health_failures",
        ),
        sa.CheckConstraint(
            "auth_mode != 'service_token' OR service_token_env_var IS NOT NULL",
            name="ck_mcp_servers_service_token_env_required",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_mcp_servers"),
    )
    op.create_index("ix_mcp_servers_tenant_id", "mcp_servers", ["tenant_id"])

    # --- api_keys ---
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("key_prefix", sa.String(32), nullable=False),
        sa.Column("key_hash", sa.Text(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_api_keys_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("key_prefix", name="uq_api_keys_key_prefix"),
        sa.PrimaryKeyConstraint("id", name="pk_api_keys"),
    )
    op.create_index("ix_api_keys_tenant_id", "api_keys", ["tenant_id"])

    # --- roles ---
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_roles_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("tenant_id", "name", name="uq_roles_tenant_id"),
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
    )
    op.create_index("ix_roles_tenant_id", "roles", ["tenant_id"])

    # --- role_bindings ---
    op.create_table(
        "role_bindings",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("subject_type", subject_type, nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name="fk_role_bindings_role_id_roles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subject_id"],
            ["api_keys.id"],
            name="fk_role_bindings_subject_id_api_keys",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "role_id", "subject_type", "subject_id", name="uq_role_bindings_role_id"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_role_bindings"),
    )
    op.create_index("ix_role_bindings_role_id", "role_bindings", ["role_id"])
    op.create_index("ix_role_bindings_subject_id", "role_bindings", ["subject_id"])

    # --- tool_permissions ---
    op.create_table(
        "tool_permissions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("server_pattern", sa.String(200), nullable=False),
        sa.Column("tool_pattern", sa.String(500), nullable=False),
        sa.Column("effect", permission_effect, nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name="fk_tool_permissions_role_id_roles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tool_permissions"),
    )
    op.create_index("ix_tool_permissions_role_id", "tool_permissions", ["role_id"])

    # --- rate_limit_policies ---
    op.create_table(
        "rate_limit_policies",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("server_pattern", sa.String(200), nullable=True),
        sa.Column("tool_pattern", sa.String(500), nullable=True),
        sa.Column("algorithm", rate_limit_algorithm, nullable=False),
        sa.Column("request_limit", sa.Integer(), nullable=False),
        sa.Column("window_seconds", sa.Integer(), nullable=False),
        sa.Column("burst_capacity", sa.Integer(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_rate_limit_policies_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subject_id"],
            ["api_keys.id"],
            name="fk_rate_limit_policies_subject_id_api_keys",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("request_limit > 0", name="ck_rate_limit_policies_positive_request_limit"),
        sa.CheckConstraint("window_seconds > 0", name="ck_rate_limit_policies_positive_window_seconds"),
        sa.CheckConstraint(
            "burst_capacity IS NULL OR burst_capacity > 0",
            name="ck_rate_limit_policies_positive_burst_capacity",
        ),
        sa.CheckConstraint(
            "algorithm != 'token_bucket' OR burst_capacity IS NOT NULL",
            name="ck_rate_limit_policies_token_bucket_burst_required",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rate_limit_policies"),
    )
    op.create_index("ix_rate_limit_policies_tenant_id", "rate_limit_policies", ["tenant_id"])
    op.create_index("ix_rate_limit_policies_subject_id", "rate_limit_policies", ["subject_id"])

    # --- Seed default tenant ---
    op.execute(
        sa.text(
            "INSERT INTO tenants (id, name, slug, created_at) "
            "VALUES (:id, :name, :slug, NOW()) "
            "ON CONFLICT (slug) DO NOTHING"
        ).bindparams(
            id=DEFAULT_TENANT_ID,
            name=DEFAULT_TENANT_NAME,
            slug=DEFAULT_TENANT_SLUG,
        )
    )


def downgrade() -> None:
    """Drop all control-plane tables and enums."""
    op.drop_table("rate_limit_policies")
    op.drop_table("tool_permissions")
    op.drop_table("role_bindings")
    op.drop_table("roles")
    op.drop_table("api_keys")
    op.drop_table("mcp_servers")
    op.drop_table("tenants")

    # Drop enums explicitly (PostgreSQL keeps them around)
    for enum_name in (
        "server_transport",
        "server_auth_mode",
        "server_status",
        "subject_type",
        "permission_effect",
        "rate_limit_algorithm",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
