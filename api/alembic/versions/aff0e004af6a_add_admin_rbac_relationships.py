"""v0.10 — Admin RBAC relationships and indexes.

Changes:
  1. Add created_at to team_servers
  2. Ensure indexes exist (idempotent)

Revision ID: aff0e004af6a
Revises: 0010
Create Date: 2026-08-18 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aff0e004af6a"
down_revision: str | None = "0010"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def _index_exists(conn, name: str) -> bool:
    """Check if a PostgreSQL index exists."""
    result = conn.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :name"),
        {"name": name},
    ).fetchone()
    return result is not None


def upgrade() -> None:
    conn = op.get_bind()

    # Add created_at to team_servers if not exists
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'team_servers' AND column_name = 'created_at'"
        )
    ).fetchone()
    if not result:
        op.add_column(
            "team_servers",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    # Create indexes if they don't exist
    indexes_to_create = [
        ("ix_super_admin_organizations_super_admin", "super_admin_organizations", ["super_admin_id"]),
        ("ix_super_admin_organizations_org", "super_admin_organizations", ["organization_tenant_id"]),
        ("ix_team_servers_server", "team_servers", ["server_id"]),
    ]

    for idx_name, table_name, columns in indexes_to_create:
        if not _index_exists(conn, idx_name):
            op.create_index(idx_name, table_name, columns)

    # Fix tenants.created_by_super_admin_id index name
    if _index_exists(conn, "ix_tenants_created_by_super_admin"):
        op.drop_index("ix_tenants_created_by_super_admin", table_name="tenants")
        if not _index_exists(conn, "ix_tenants_created_by_super_admin_id"):
            op.create_index("ix_tenants_created_by_super_admin_id", "tenants", ["created_by_super_admin_id"])

    # Fix rate_limit_policies subject_type index
    if _index_exists(conn, "ix_rate_limit_policies_subject_type"):
        op.drop_index("ix_rate_limit_policies_subject_type", table_name="rate_limit_policies")


def downgrade() -> None:
    conn = op.get_bind()

    # Recreate rate_limit_policies index if it was dropped
    if not _index_exists(conn, "ix_rate_limit_policies_subject_type"):
        op.create_index(
            "ix_rate_limit_policies_subject_type", "rate_limit_policies", ["subject_type"]
        )

    # Revert tenants index
    if _index_exists(conn, "ix_tenants_created_by_super_admin_id"):
        op.drop_index("ix_tenants_created_by_super_admin_id", table_name="tenants")
        if not _index_exists(conn, "ix_tenants_created_by_super_admin"):
            op.create_index("ix_tenants_created_by_super_admin", "tenants", ["created_by_super_admin_id"])

    # Drop created_at from team_servers
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'team_servers' AND column_name = 'created_at'"
        )
    ).fetchone()
    if result:
        op.drop_column("team_servers", "created_at")

    # Drop indexes we created
    for idx_name in [
        "ix_super_admin_organizations_super_admin",
        "ix_super_admin_organizations_org",
        "ix_team_servers_server",
    ]:
        if _index_exists(conn, idx_name):
            op.drop_index(idx_name, table_name=idx_name.split("_")[1])