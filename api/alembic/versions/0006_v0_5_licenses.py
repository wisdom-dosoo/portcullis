"""v0.5 — Platform licenses.

Changes:
  1. Add the ``licenses`` table with signed license-key storage (key hash only)
     and entitlement fields (plan, seat/server limits, term, licensee).

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-15 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "licenses",
        sa.Column("id", sa.Uuid(), primary_key=True),
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
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "plan",
            sa.Enum(
                "community",
                "pro",
                "enterprise",
                name="license_plan",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "active",
                "expired",
                "revoked",
                name="license_status",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column("key_hash", sa.Text(), nullable=False),
        sa.Column("seat_limit", sa.Integer(), nullable=False),
        sa.Column("server_limit", sa.Integer(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("licensee", sa.String(length=300), nullable=False),
        sa.Column(
            "issued_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint("seat_limit > 0", name="ck_licenses_positive_seat_limit"),
        sa.CheckConstraint(
            "server_limit IS NULL OR server_limit > 0",
            name="ck_licenses_positive_server_limit",
        ),
    )
    op.create_index("ix_licenses_tenant_id", "licenses", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_licenses_tenant_id", table_name="licenses")
    op.drop_table("licenses")
    # PostgreSQL enums cannot drop values; the enum types are left in place.