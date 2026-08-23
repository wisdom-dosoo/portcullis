"""v0.7 — Org default roles + invitation role assignment.

Changes:
  1. Create `org_role` enum type
  2. Add `role` column to `invitations` table (org_admin, developer, viewer)
  3. Add `org_role` column to `users` table for direct org-level role (denormalized for quick checks)

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-17 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # 1. Create org_role enum type
    org_role_enum = sa.Enum(
        "org_owner",
        "org_admin",
        "developer",
        "viewer",
        name="org_role",
    )
    org_role_enum.create(op.get_bind(), checkfirst=True)

    # 2. Add role column to invitations (default: developer)
    op.add_column(
        "invitations",
        sa.Column(
            "role",
            org_role_enum,
            nullable=False,
            server_default="developer",
        ),
    )

    # 3. Add org_role column to users for quick org-level role checks
    op.add_column(
        "users",
        sa.Column(
            "org_role",
            org_role_enum,
            nullable=True,
        ),
    )
    op.create_index("ix_users_org_role", "users", ["org_role"])


def downgrade() -> None:
    op.drop_index("ix_users_org_role", table_name="users")
    op.drop_column("users", "org_role")
    op.drop_column("invitations", "role")
    # Drop enum type
    org_role_enum = sa.Enum(name="org_role")
    org_role_enum.drop(op.get_bind(), checkfirst=True)