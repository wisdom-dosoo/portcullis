"""v0.9 — mTLS upstream columns for McpServer (Gap P0-5).

Adds ssl_ca, ssl_cert, ssl_key Text columns to mcp_servers.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-29 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("mcp_servers", sa.Column("ssl_ca", sa.Text(), nullable=True))
    op.add_column("mcp_servers", sa.Column("ssl_cert", sa.Text(), nullable=True))
    op.add_column("mcp_servers", sa.Column("ssl_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("mcp_servers", "ssl_key")
    op.drop_column("mcp_servers", "ssl_cert")
    op.drop_column("mcp_servers", "ssl_ca")
