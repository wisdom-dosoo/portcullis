"""v0.9 — Administrative RBAC: teams, org_members, team_servers.

Changes:
  1. Create `teams` table — team per tenant with name
  2. Create `team_servers` table — many-to-many linking teams to MCP servers
  3. Create `org_members` table — human dashboard users with admin_role + optional team_id
  4. Add indexes for common query patterns

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-18 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def _enum_exists(conn, name: str) -> bool:
    """Check if a PostgreSQL enum type exists."""
    result = conn.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = :name"),
        {"name": name},
    ).fetchone()
    return result is not None


def upgrade() -> None:
    conn = op.get_bind()

    # Create enum if it doesn't exist - use raw SQL
    if not _enum_exists(conn, "org_member_role"):
        conn.execute(
            sa.text(
                "CREATE TYPE org_member_role AS ENUM "
                "('org_owner', 'org_admin', 'developer', 'team_member', 'viewer', 'auditor', 'billing_admin')"
            )
        )

    # 1. teams table
    op.create_table(
        "teams",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.UniqueConstraint("tenant_id", "name", name="uq_teams_tenant_name"),
    )

    # 2. team_servers (many-to-many)
    op.create_table(
        "team_servers",
        sa.Column(
            "team_id",
            sa.Uuid(),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "server_id",
            sa.Uuid(),
            sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("team_id", "server_id", name="pk_team_servers"),
    )
    op.create_index("ix_team_servers_server", "team_servers", ["server_id"])

    # 3. org_members table — human dashboard users (NOT agent subjects)
    # Use native_enum=False to avoid SQLAlchemy trying to create the enum
    org_member_role_enum = sa.Enum(
        "org_owner",
        "org_admin",
        "developer",
        "team_member",
        "viewer",
        "auditor",
        "billing_admin",
        name="org_member_role",
        native_enum=False,  # Use CHECK constraint instead of native enum
        create_constraint=False,  # Don't create the enum or constraint
    )

    op.create_table(
        "org_members",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("user_subject", sa.Text(), nullable=False),
        sa.Column(
            "admin_role",
            org_member_role_enum,
            nullable=False,
        ),
        sa.Column(
            "team_id",
            sa.Uuid(),
            sa.ForeignKey("teams.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.UniqueConstraint("tenant_id", "user_subject", name="uq_org_members_tenant_subject"),
    )
    op.create_index("ix_org_members_team", "org_members", ["team_id"])


def downgrade() -> None:
    conn = op.get_bind()
    op.drop_index("ix_org_members_team", table_name="org_members")
    op.drop_table("org_members")
    op.drop_index("ix_team_servers_server", table_name="team_servers")
    op.drop_table("team_servers")
    op.drop_table("teams")
    # Drop enum
    if _enum_exists(conn, "org_member_role"):
        conn.execute(sa.text("DROP TYPE org_member_role"))