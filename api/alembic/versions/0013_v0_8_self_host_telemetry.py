"""v0.8 — anonymous self-host install telemetry.

Changes:
  1. Add the ``instances`` table for opt-in self-host heartbeats.  Each
     self-hosted install reports a persistent ``install_id`` (kept in its
     local config) when ``TELEMETRY_ENABLED`` is on, so the operator can
     count active installs and build the self-host -> Cloud conversion
     funnel described in the Phase 4 strategy review (docs/strategy.md).
     Deliberately anonymous: no tenant linkage and no user data.

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-19 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "instances",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("install_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("server_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("install_id", name="uq_instances_install_id"),
    )
    op.create_index(
        op.f("ix_instances_install_id"), "instances", ["install_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_instances_install_id"), table_name="instances")
    op.drop_table("instances")