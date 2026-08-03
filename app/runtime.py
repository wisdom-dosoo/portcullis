"""Gateway runtime singleton holding all I/O resources."""

from __future__ import annotations

from dataclasses import dataclass

import httpx
import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import Settings
from app.models.db import create_engine, create_session_factory, dispose_engine

logger = structlog.get_logger(__name__)


@dataclass
class Runtime:
    """Holds the process-wide async I/O handles for the gateway."""

    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    redis: Redis
    http_client: httpx.AsyncClient

    @classmethod
    def build(cls, settings: Settings) -> Runtime:
        """Construct all I/O resources from validated settings."""
        engine = create_engine(settings.database_url)
        session_factory = create_session_factory(engine)
        redis: Redis = Redis.from_url(settings.redis_url)
        http_client = httpx.AsyncClient(
            timeout=settings.upstream_connect_timeout_seconds,
        )
        logger.info(
            "runtime.built",
            environment=settings.environment,
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
