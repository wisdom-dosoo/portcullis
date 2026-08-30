"""v0.9 — tamper-evident audit hash chain (Gap 5).

Adds prev_hash and entry_hash to audit_logs for hash-chained integrity
verification. Each entry's entry_hash = SHA256(prev_hash + tenant_id + ...),
enabling append-only verification.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-29 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("prev_hash", sa.String(length=64), nullable=True))
    op.add_column("audit_logs", sa.Column("entry_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_audit_logs_prev_hash", "audit_logs", ["prev_hash"])
    op.create_index("ix_audit_logs_entry_hash", "audit_logs", ["entry_hash"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_entry_hash", table_name="audit_logs")
    op.drop_index("ix_audit_logs_prev_hash", table_name="audit_logs")
    op.drop_column("audit_logs", "entry_hash")
    op.drop_column("audit_logs", "prev_hash")
