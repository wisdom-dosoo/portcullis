"""v0.9 — stdio-bridge support for McpServer.

Adds bridge_command, bridge_port columns to mcp_servers and
adds 'stdio_bridge' to the server_transport enum.

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-22 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # Add 'stdio_bridge' to the server_transport enum
    op.execute("ALTER TYPE server_transport ADD VALUE IF NOT EXISTS 'stdio_bridge'")

    # Add bridge configuration columns
    op.add_column("mcp_servers", sa.Column("bridge_command", sa.Text(), nullable=True))
    op.add_column("mcp_servers", sa.Column("bridge_port", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("mcp_servers", "bridge_port")
    op.drop_column("mcp_servers", "bridge_command")
    # Note: PostgreSQL does not support removing values from an enum type.
    # A full downgrade would require recreating the enum, which is left as
    # an exercise if needed.
