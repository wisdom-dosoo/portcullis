"""v0.8 — Super admin organization ownership tracking.

Changes:
  1. Add `created_org_count` column to `users` table (super admin org creation counter)
  2. Create `super_admin_organizations` join table linking super admins to orgs they created
  3. Add `created_by_super_admin_id` to track which super admin created an organization

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-18 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # 1. Add created_org_count to users table
    op.add_column(
        "users",
        sa.Column("created_org_count", sa.Integer(), nullable=False, server_default="0"),
    )

    # 2. Create super_admin_organizations join table
    op.create_table(
        "super_admin_organizations",
        sa.Column(
            "super_admin_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("super_admin_id", "organization_tenant_id"),
    )
    op.create_index(
        "ix_super_admin_organizations_super_admin",
        "super_admin_organizations",
        ["super_admin_id"],
    )
    op.create_index(
        "ix_super_admin_organizations_org",
        "super_admin_organizations",
        ["organization_tenant_id"],
    )

    # 3. Add created_by_super_admin_id to tenants table
    op.add_column(
        "tenants",
        sa.Column(
            "created_by_super_admin_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_tenants_created_by_super_admin",
        "tenants",
        ["created_by_super_admin_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenants_created_by_super_admin", table_name="tenants")
    op.drop_column("tenants", "created_by_super_admin_id")
    op.drop_index("ix_super_admin_organizations_org", table_name="super_admin_organizations")
    op.drop_index("ix_super_admin_organizations_super_admin", table_name="super_admin_organizations")
    op.drop_table("super_admin_organizations")
    op.drop_column("users", "created_org_count")