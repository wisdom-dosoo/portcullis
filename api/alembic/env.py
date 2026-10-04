"""Alembic async migration environment."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from app.config import get_settings
from app.models.orm import Base

# Alembic Config object providing access to values in alembic.ini
config = context.config

# Interpret the config file for Python logging, if present
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate support
target_metadata = Base.metadata


def do_run_migrations(connection: object) -> None:
    """Run migrations in 'online' mode using a synchronous connection."""
    context.configure(
        connection=connection,  # type: ignore[arg-type]
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (P2: --sql review of risky DDL).

    Emits SQL to stdout without a live connection so enum alters and similar
    risky DDL can be reviewed via ``alembic upgrade head --sql``.
    """
    url = config.get_main_option("sqlalchemy.url") or get_settings().database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations via a synchronous bridge."""
    # Prefer the URL set via alembic_cfg.set_main_option over settings.
    # P3 fix: use the shared create_engine helper (SSL + pool tuning) instead
    # of raw create_async_engine — the raw call skipped _build_asyncpg_ssl_args,
    # so Neon/managed hosts connected without TLS and asyncpg refused to send
    # the password: InvalidAuthorizationSpecificationError: connection is
    # insecure (try using `sslmode=require`).
    from app.models.db import create_engine

    url = config.get_main_option("sqlalchemy.url") or get_settings().database_url
    engine = create_engine(url)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
