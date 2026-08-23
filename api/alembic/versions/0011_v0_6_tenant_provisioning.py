"""v0.6 — Tenant provisioning audit event.

Changes:
  1. Extend the audit_event_type enum with 'tenant_provisioned' so tenant
     provisioning (via CLI or the /admin/tenants endpoint) is auditable.

Revision ID: 0011
Revises: aff0e004af6a
Create Date: 2026-08-19 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: str | None = "aff0e004af6a"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # PG 12+ permits ALTER TYPE ADD VALUE inside a transaction as long as the
    # new value is not used within the same transaction block.
    op.execute(
        sa.text("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'tenant_provisioned'")
    )


def downgrade() -> None:
    # PostgreSQL enums cannot drop values; the enum addition is left in place.
    pass