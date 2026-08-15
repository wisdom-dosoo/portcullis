"""Integration test: Alembic migration creates all tables and seeds default tenant."""

from __future__ import annotations

import asyncio

import pytest
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command

EXPECTED_TABLES = {
    "tenants",
    "mcp_servers",
    "api_keys",
    "roles",
    "role_bindings",
    "tool_permissions",
    "rate_limit_policies",
}

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_TENANT_SLUG = "default"


@pytest.mark.integration
async def test_migration_creates_all_tables_and_seeds_default_tenant(
    postgres_container: str,
) -> None:
    """Upgrade to head then verify all 7 tables exist and default tenant is seeded."""
    # Run alembic upgrade to head using the container URL.
    # Must run in a thread because env.py calls asyncio.run() which
    # cannot be called from within an already-running event loop.
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", postgres_container)
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")

    # Inspect schema using async engine
    engine = create_async_engine(postgres_container, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            # Get all table names
            table_names = set(
                await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
            )
            assert EXPECTED_TABLES.issubset(table_names), (
                f"Missing tables: {EXPECTED_TABLES - table_names}"
            )

            # Assert exactly one tenant with slug 'default'
            result = await conn.execute(
                text("SELECT id::text, slug FROM tenants WHERE slug = :slug"),
                {"slug": DEFAULT_TENANT_SLUG},
            )
            rows = result.fetchall()
            assert len(rows) == 1, f"Expected 1 default tenant, found {len(rows)}"
            tenant_id, tenant_slug = rows[0]
            assert tenant_id == DEFAULT_TENANT_ID
            assert tenant_slug == DEFAULT_TENANT_SLUG
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_platform_admin_column_and_audit_enum_exist(
    postgres_container: str,
) -> None:
    """v0.4 adds users.is_platform_admin and the platform_admin_granted audit value."""
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", postgres_container)
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")

    engine = create_async_engine(postgres_container, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            columns = {
                col["name"]
                for col in await conn.run_sync(
                    lambda sync_conn: inspect(sync_conn).get_columns("users")
                )
            }
            assert "is_platform_admin" in columns

            values = await conn.scalars(text("SELECT enum_range(NULL::audit_event_type)"))
            enum_text = str(values.first())
            assert "platform_admin_granted" in enum_text, enum_text
    finally:
        await engine.dispose()
