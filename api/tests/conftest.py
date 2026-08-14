"""Shared pytest fixtures for Portcullis integration and unit tests."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Generator

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from testcontainers.community.postgres import PostgresContainer
from testcontainers.community.redis import RedisContainer

from app.config import get_settings
from app.models.db import create_session_factory


@pytest.fixture(scope="session")
def postgres_container() -> Generator[str, None, None]:
    """Start a PostgreSQL 16 container and yield its asyncpg connection URL."""
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql+asyncpg://")
        os.environ["DATABASE_URL"] = url
        get_settings.cache_clear()
        yield url
        # restore env after session
        os.environ.pop("DATABASE_URL", None)
        get_settings.cache_clear()


@pytest.fixture(scope="session")
def redis_container() -> Generator[str, None, None]:
    """Start a Redis 7 container and yield its URL."""
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
