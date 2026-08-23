"""v0.7 — SSO, seat enforcement, and usage metering.

Changes:
  1. Add the ``usage_daily`` table for per-tenant daily usage counters
     (billing-tier metering).  No SSO table is needed — the OIDC provider is
     config-driven; seat enforcement reuses the existing licenses table.

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-19 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "usage_daily",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tool_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rbac_denials", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rate_limit_rejections", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "usage_date", name="uq_usage_daily_tenant_date"),
    )
    op.create_index(
        op.f("ix_usage_daily_tenant_id"), "usage_daily", ["tenant_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_usage_daily_tenant_id"), table_name="usage_daily")
    op.drop_table("usage_daily")