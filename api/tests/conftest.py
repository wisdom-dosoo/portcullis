"""Shared pytest fixtures for Portcullis integration and unit tests."""

from __future__ import annotations

import os
import subprocess
from collections.abc import AsyncGenerator, Generator

import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)

from app.config import get_settings
from app.models.db import create_session_factory

# When running in CI (GitHub Actions) the Postgres/Redis service containers are
# already exported through DATABASE_URL/REDIS_URL, so the container fixtures reuse
# them instead of starting a nested Testcontainers instance.  Locally the
# fixtures start dedicated containers as before.


def _migrate_database(url: str) -> None:
    """Run ``alembic upgrade head`` against url using the installed alembic."""

    # Alembic's env.py calls asyncio.run() itself, so the migration must not run
    # inside an already-running event loop; a subprocess is therefore the safe
    # (and CI-identical) way to invoke it.
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run(["alembic", "upgrade", "head"], check=True, env=env, capture_output=True)


@pytest.fixture(scope="session")
def postgres_container() -> Generator[str, None, None]:
    """Provide a Postgres 16 connection URL (session-scoped, migrated to head)."""
    existing = os.environ.get("DATABASE_URL")
    if existing:
        # CI service container: already running, just ensure schema is current.
        _migrate_database(existing)
        yield existing
        return

    from testcontainers.community.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql+asyncpg://")
        os.environ["DATABASE_URL"] = url
        get_settings.cache_clear()
        _migrate_database(url)
        yield url
        # restore env after session
        os.environ.pop("DATABASE_URL", None)
        get_settings.cache_clear()


@pytest.fixture(scope="session")
def redis_container() -> Generator[str, None, None]:
    """Provide a Redis 7 URL (session-scoped), reusing the CI service if present."""
    existing = os.environ.get("REDIS_URL")
    if existing:
        yield existing
        return

    from testcontainers.community.redis import RedisContainer

    with RedisContainer("redis:7-alpine") as redis:
        host = redis.get_container_host_ip()
        port = redis.get_exposed_port(6379)
        url = f"redis://{host}:{port}/0"
        os.environ["REDIS_URL"] = url
        get_settings.cache_clear()
        yield url
        os.environ.pop("REDIS_URL", None)
        get_settings.cache_clear()


@pytest.fixture()
async def async_engine(postgres_container: str) -> AsyncGenerator[AsyncEngine, None]:
    """Create an async SQLAlchemy engine connected to the test PostgreSQL container."""
    engine = create_async_engine(postgres_container, pool_pre_ping=True)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture()
async def async_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a function-scoped async session connected to the test database."""
    factory = create_session_factory(async_engine)
    async with factory() as session:
        yield session


@pytest.fixture()
async def redis_client(redis_container: str) -> AsyncGenerator[Redis, None]:
    """Create a function-scoped Redis client connected to the test container."""
    client = Redis.from_url(redis_container, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()
