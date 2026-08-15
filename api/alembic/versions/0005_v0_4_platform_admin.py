"""v0.4 — Platform-admin identity.

Changes:
  1. Add users.is_platform_admin (default false) — a person-level flag granting
     platform-admin privileges, gated by the new PLATFORM_ADMIN path.
  2. Extend the audit_event_type enum with 'platform_admin_granted' so admin
     bootstrap actions are auditable.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-15 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_platform_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # PG 12+ permits ALTER TYPE ADD VALUE inside a transaction as long as the
    # new value is not used within the same transaction block.
    op.execute(
        sa.text("ALTER TYPE audit_event_type ADD VALUE 'platform_admin_granted'")
    )


def downgrade() -> None:
    op.drop_column("users", "is_platform_admin")
    # PostgreSQL enums cannot drop values; the enum addition is left in place.