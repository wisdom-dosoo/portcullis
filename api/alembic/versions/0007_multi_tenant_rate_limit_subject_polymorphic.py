"""v0.6 — Multi-tenancy tenant extraction + Rate limit subject polymorphism.

Changes:
  1. Remove FK constraint on rate_limit_policies.subject_id → api_keys.id
  2. Change subject_id column type from UUID to TEXT to support both API key UUIDs and OAuth sub claims
  3. Add subject_type column to rate_limit_policies (parallel to role_bindings pattern)

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-17 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # 1. Drop the FK constraint on subject_id
    op.drop_constraint(
        "fk_rate_limit_policies_subject_id_api_keys",
        "rate_limit_policies",
        type_="foreignkey",
    )

    # 2. Change subject_id from UUID to TEXT (to support both API key UUIDs and OAuth sub strings)
    op.alter_column(
        "rate_limit_policies",
        "subject_id",
        type_=sa.Text(),
        existing_type=sa.Uuid(),
        nullable=True,
    )

    # 3. Add subject_type column
    op.add_column(
        "rate_limit_policies",
        sa.Column(
            "subject_type",
            sa.Enum(
                "api_key",
                "oauth_subject",
                name="subject_type",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=True,
            server_default="api_key",
        ),
    )

    # 4. Create index for the new subject_type column
    op.create_index(
        "ix_rate_limit_policies_subject_type", "rate_limit_policies", ["subject_type"]
    )


def downgrade() -> None:
    # Drop index
    op.drop_index("ix_rate_limit_policies_subject_type", table_name="rate_limit_policies")

    # Drop subject_type column
    op.drop_column("rate_limit_policies", "subject_type")

    # Revert subject_id to UUID (will fail if non-UUID data exists — acceptable for downgrade)
    op.alter_column(
        "rate_limit_policies",
        "subject_id",
        type_=sa.Uuid(),
        existing_type=sa.Text(),
        nullable=True,
    )

    # Re-add FK constraint (will fail if orphaned data exists)
    op.create_foreign_key(
        "fk_rate_limit_policies_subject_id_api_keys",
        "rate_limit_policies",
        "api_keys",
        ["subject_id"],
        ["id"],
        ondelete="CASCADE",
    )