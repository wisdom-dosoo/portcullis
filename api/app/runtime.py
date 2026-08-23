"""Gateway runtime singleton holding all I/O resources."""

from __future__ import annotations

from dataclasses import dataclass

import httpx
import structlog
from redis.asyncio import Redis, RedisCluster
from redis.asyncio.sentinel import Sentinel
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import RedisMode, Settings
from app.models.db import create_engine, create_session_factory, dispose_engine

logger = structlog.get_logger(__name__)


def _build_redis_client(settings: Settings) -> Redis | RedisCluster:
    """Build a Redis client based on the configured mode (standalone, sentinel, cluster)."""
    if settings.redis_mode == RedisMode.STANDALONE:
        return Redis.from_url(
            settings.redis_url,
            max_connections=settings.redis_max_connections,
            socket_timeout=settings.redis_socket_timeout_seconds,
            socket_connect_timeout=settings.redis_socket_connect_timeout_seconds,
            decode_responses=True,
        )

    if settings.redis_mode == RedisMode.SENTINEL:
        sentinel = Sentinel(
            settings.redis_sentinel_hosts_tuple,
            socket_timeout=settings.redis_socket_timeout_seconds,
            socket_connect_timeout=settings.redis_socket_connect_timeout_seconds,
        )
        return sentinel.master_for(
            settings.redis_sentinel_master,
            max_connections=settings.redis_max_connections,
            decode_responses=True,
        )

    if settings.redis_mode == RedisMode.CLUSTER:
        return RedisCluster.from_url(
            settings.redis_url,
            max_connections=settings.redis_max_connections,
            socket_timeout=settings.redis_socket_timeout_seconds,
            socket_connect_timeout=settings.redis_socket_connect_timeout_seconds,
            decode_responses=True,
        )

    raise ValueError(f"Unknown Redis mode: {settings.redis_mode}")


@dataclass
class Runtime:
    """Holds the process-wide async I/O handles for the gateway."""

    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    redis: Redis | RedisCluster
    http_client: httpx.AsyncClient

    @classmethod
    def build(cls, settings: Settings) -> Runtime:
        """Construct all I/O resources from validated settings."""
        engine = create_engine(settings.database_url)
        session_factory = create_session_factory(engine)
        redis = _build_redis_client(settings)
        http_client = httpx.AsyncClient(
            timeout=settings.upstream_connect_timeout_seconds,
        )
        logger.info(
            "runtime.built",
            environment=settings.environment,
            redis_mode=settings.redis_mode.value,
        )
        return cls(
            engine=engine,
            session_factory=session_factory,
            redis=redis,
            http_client=http_client,
        )

    async def close(self) -> None:
        """Release all pooled and persistent I/O resources."""
        await dispose_engine(self.engine)
        await self.redis.aclose()
        await self.http_client.aclose()
        logger.info("runtime.closed")
