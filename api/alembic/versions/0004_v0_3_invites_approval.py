"""v0.3 — Invitations and org-join approval.

Changes:
  1. Add the user_approval_status enum and the users.approval_status column
     (defaults to 'approved' so existing accounts stay active).  Users created
     via the org-join flow start as 'pending' until an admin approves them.
  2. Create the invitation_status enum.
  3. Create the invitations table: one-time, admin-minted invite codes with an
     HMAC-SHA256 code hash keyed by the server pepper (plaintext never stored),
     optional email binding, and expiry.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. User approval status enum + column.
    # -------------------------------------------------------------------------
    user_approval_status = sa.Enum(
        "approved",
        "pending",
        "rejected",
        name="user_approval_status",
    )
    user_approval_status.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "approval_status",
            sa.Enum(
                "approved",
                "pending",
                "rejected",
                name="user_approval_status",
            ),
            nullable=False,
            server_default="approved",
        ),
    )

    # -------------------------------------------------------------------------
    # 2. Invitation status enum.
    # -------------------------------------------------------------------------
    sa.Enum(
        "active",
        "used",
        "revoked",
        "expired",
        name="invitation_status",
    ).create(op.get_bind(), checkfirst=True)

    # -------------------------------------------------------------------------
    # 3. Invitations table.
    # -------------------------------------------------------------------------
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("org_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "used", "revoked", "expired", name="invitation_status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("redeemed_by", sa.Uuid(), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_invitations_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="fk_invitations_created_by_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["redeemed_by"],
            ["users.id"],
            name="fk_invitations_redeemed_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_invitations"),
    )
    op.create_index("ix_invitations_tenant_id", "invitations", ["tenant_id"])
    op.create_index("ix_invitations_created_by", "invitations", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_invitations_created_by", table_name="invitations")
    op.drop_index("ix_invitations_tenant_id", table_name="invitations")
    op.drop_table("invitations")
    sa.Enum(name="invitation_status").drop(op.get_bind(), checkfirst=True)

    op.drop_column("users", "approval_status")
    sa.Enum(name="user_approval_status").drop(op.get_bind(), checkfirst=True)