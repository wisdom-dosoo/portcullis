"""Async database engine and session boundary."""

from __future__ import annotations

from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _build_asyncpg_ssl_args(database_url: str) -> dict:
    """Return asyncpg-specific connect_args for SSL based on the database URL.

    Neon and other managed PostgreSQL services require SSL. The asyncpg driver
    accepts an `ssl` parameter (bool or SSLContext), not `sslmode` like libpq.
    """
    parsed = urlparse(database_url)
    # Use SSL for non-localhost hosts
    if parsed.hostname and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        return {"ssl": True}
    return {}


def create_engine(database_url: str) -> AsyncEngine:
    """Create a lazily connected SQLAlchemy async engine (P2/P3: tuned pools)."""
    from app.config import get_settings as _get_settings

    connect_args = _build_asyncpg_ssl_args(database_url)
    try:
        settings = _get_settings()
        if settings.db_pgbouncer:
            # P3: PgBouncer transaction mode + prepared statements are
            # incompatible — disable the asyncpg statement cache.
            connect_args = {**connect_args, "statement_cache_size": 0}
        return create_async_engine(
            database_url,
            pool_pre_ping=True,
            connect_args=connect_args,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=settings.db_pool_recycle_seconds,
            pool_timeout=settings.db_pool_timeout_seconds,
        )
    except Exception:
        return create_async_engine(database_url, pool_pre_ping=True, connect_args=connect_args)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create request-scoped async sessions for an engine."""
    return async_sessionmaker(engine, expire_on_commit=False)


async def dispose_engine(engine: AsyncEngine) -> None:
    """Release all pooled database connections."""
    await engine.dispose()
