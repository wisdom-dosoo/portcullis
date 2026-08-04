"""v0.2 — OAuth subject support and audit log table.

Changes:
  1. Add 'oauth_subject' value to the subject_type PostgreSQL enum.
  2. Drop FK + unique constraint + index on role_bindings.subject_id.
  3. Convert role_bindings.subject_id from UUID to TEXT so both API-key UUIDs
     and arbitrary OAuth sub claims can be stored.
  4. Recreate the unique constraint and index.
  5. Create the audit_event_type enum.
  6. Create the audit_logs table with a composite (tenant_id, created_at) index.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-04 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. Extend the subject_type enum with the new OAuth value.
    #    PostgreSQL requires ALTER TYPE … ADD VALUE outside a transaction, but
    #    Alembic wraps upgrades in a transaction by default.  We use
    #    execute_if(dialect="postgresql") and issue a plain DDL statement.
    # -------------------------------------------------------------------------
    op.execute(sa.text("ALTER TYPE subject_type ADD VALUE IF NOT EXISTS 'oauth_subject'"))

    # -------------------------------------------------------------------------
    # 2. Remove constraints that reference role_bindings.subject_id so the
    #    column type can be changed.
    # -------------------------------------------------------------------------
    # Unique constraint on (role_id, subject_type, subject_id)
    op.drop_constraint("uq_role_bindings_role_id", "role_bindings", type_="unique")

    # Foreign key to api_keys.id
    op.drop_constraint(
        "fk_role_bindings_subject_id_api_keys", "role_bindings", type_="foreignkey"
    )

    # Index on subject_id
    op.drop_index("ix_role_bindings_subject_id", table_name="role_bindings")

    # -------------------------------------------------------------------------
    # 3. Convert subject_id from UUID → TEXT.
    #    The USING clause casts existing UUID values to their text representation.
    # -------------------------------------------------------------------------
    op.alter_column(
        "role_bindings",
        "subject_id",
        existing_type=sa.Uuid(),
        type_=sa.Text(),
        postgresql_using="subject_id::text",
        nullable=False,
    )

    # -------------------------------------------------------------------------
    # 4. Recreate the index and unique constraint on the new TEXT column.
    # -------------------------------------------------------------------------
    op.create_index("ix_role_bindings_subject_id", "role_bindings", ["subject_id"])
    op.create_unique_constraint(
        "uq_role_bindings_role_id",
        "role_bindings",
        ["role_id", "subject_type", "subject_id"],
    )

    # -------------------------------------------------------------------------
    # 5. Create the audit_event_type enum.
    # -------------------------------------------------------------------------
    audit_event_type = sa.Enum(
        "auth_failure",
        "rbac_deny",
        "tool_call",
        name="audit_event_type",
    )
    audit_event_type.create(op.get_bind(), checkfirst=True)

    # -------------------------------------------------------------------------
    # 6. Create the audit_logs table.
    # -------------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("subject_id", sa.String(500), nullable=True),
        sa.Column(
            "subject_type",
            sa.Enum(
                "api_key",
                "oauth_subject",
                name="subject_type",
                create_constraint=False,  # reuse the existing DB enum
            ),
            nullable=True,
        ),
        sa.Column(
            "event_type",
            sa.Enum(
                "auth_failure",
                "rbac_deny",
                "tool_call",
                name="audit_event_type",
                create_constraint=False,  # already created above
            ),
            nullable=False,
        ),
        sa.Column("server_slug", sa.String(200), nullable=True),
        sa.Column("tool_name", sa.String(500), nullable=True),
        sa.Column("rpc_method", sa.String(200), nullable=True),
        sa.Column("outcome", sa.String(50), nullable=False),
        sa.Column("client_ip", sa.String(100), nullable=True),
        sa.Column("request_id", sa.String(100), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_logs"),
    )

    # Composite index for the primary query pattern: per-tenant reverse-chron.
    op.create_index(
        "ix_audit_logs_tenant_created",
        "audit_logs",
        ["tenant_id", "created_at"],
    )


def downgrade() -> None:
    # -------------------------------------------------------------------------
    # Drop audit_logs and its enum.
    # -------------------------------------------------------------------------
    op.drop_index("ix_audit_logs_tenant_created", table_name="audit_logs")
    op.drop_table("audit_logs")
    sa.Enum(name="audit_event_type").drop(op.get_bind(), checkfirst=True)

    # -------------------------------------------------------------------------
    # Revert role_bindings.subject_id from TEXT back to UUID.
    #
    # WARNING: this will fail if any row contains a non-UUID subject_id value
    # (i.e. if OAuth subjects have been stored).  Downgrade is intended for
    # fresh deployments only.
    # -------------------------------------------------------------------------
    op.drop_index("ix_role_bindings_subject_id", table_name="role_bindings")
    op.drop_constraint("uq_role_bindings_role_id", "role_bindings", type_="unique")

    op.alter_column(
        "role_bindings",
        "subject_id",
        existing_type=sa.Text(),
        type_=sa.Uuid(),
        postgresql_using="subject_id::uuid",
        nullable=False,
    )

    # Restore the FK constraint to api_keys.id
    op.create_foreign_key(
        "fk_role_bindings_subject_id_api_keys",
        "role_bindings",
        "api_keys",
        ["subject_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Restore the unique constraint and index
    op.create_unique_constraint(
        "uq_role_bindings_role_id",
        "role_bindings",
        ["role_id", "subject_type", "subject_id"],
    )
    op.create_index("ix_role_bindings_subject_id", "role_bindings", ["subject_id"])

    # Note: PostgreSQL does not support removing enum values, so we cannot
    # undo the 'oauth_subject' addition to subject_type.
