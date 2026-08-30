"""Background health monitor for upstream MCP servers."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.models.orm import McpServer, ServerStatus
from app.observability.metrics import UPSTREAM_CONSECUTIVE_FAILURES, UPSTREAM_HEALTH

logger = structlog.get_logger(__name__)


class HealthMonitor:
    """Periodically probes all active and unhealthy upstream MCP servers."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        http_client: httpx.AsyncClient,
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._http_client = http_client
        self._settings = settings
        self._stop_event = asyncio.Event()

    async def probe(self, server: McpServer) -> bool:
        """Probe a single server's health endpoint.

        Updates ``consecutive_health_failures``, ``last_health_check_at``,
        and ``status`` in-place on the ORM object.

        Returns:
            True if the server responded with status < 400, False otherwise.
        """
        url = f"{server.upstream_url.rstrip('/')}{server.health_check_path}"
        timeout = httpx.Timeout(
            self._settings.upstream_read_timeout_seconds,
            connect=self._settings.upstream_connect_timeout_seconds,
        )
        healthy = False
        try:
            response = await self._http_client.get(
                url,
                timeout=timeout,
                follow_redirects=False,
            )
            healthy = response.status_code < 400
        except Exception:  # noqa: BLE001
            healthy = False

        server.last_health_check_at = datetime.now(UTC)

        if healthy:
            server.consecutive_health_failures = 0
            UPSTREAM_HEALTH.labels(server_slug=server.slug).set(1)
            UPSTREAM_CONSECUTIVE_FAILURES.labels(server_slug=server.slug).set(0)
            if server.status == ServerStatus.UNHEALTHY:
                server.status = ServerStatus.ACTIVE
                logger.info(
                    "health_monitor.recovered",
                    slug=server.slug,
                )
        else:
            server.consecutive_health_failures += 1
            UPSTREAM_CONSECUTIVE_FAILURES.labels(server_slug=server.slug).set(
                server.consecutive_health_failures
            )
            logger.warning(
                "health_monitor.probe_failed",
                slug=server.slug,
                consecutive_failures=server.consecutive_health_failures,
            )
            if server.consecutive_health_failures >= self._settings.health_check_failure_threshold:
                server.status = ServerStatus.UNHEALTHY
                UPSTREAM_HEALTH.labels(server_slug=server.slug).set(0)
                logger.error(
                    "health_monitor.marked_unhealthy",
                    slug=server.slug,
                )

        return healthy

    async def run_once(self) -> None:
        """Probe all active and unhealthy servers in a single pass."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(McpServer).where(
                    McpServer.status.in_([ServerStatus.ACTIVE, ServerStatus.UNHEALTHY])
                )
            )
            servers = list(result.scalars().all())

            for server in servers:
                await self.probe(server)

            await session.commit()

    async def start(self) -> None:
        """Run the health monitor loop until ``stop()`` is called."""
        logger.info("health_monitor.started")
        while not self._stop_event.is_set():
            try:
                await self.run_once()
            except Exception:
                logger.exception("health_monitor.run_once_failed")

            # Wait for the interval or stop signal (whichever comes first)
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self._settings.health_check_interval_seconds,
                )
            except TimeoutError:
                pass

        logger.info("health_monitor.stopped")

    async def stop(self) -> None:
        """Signal the monitor loop to shut down."""
        self._stop_event.set()
