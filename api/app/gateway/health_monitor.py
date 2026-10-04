"""Background health monitor for upstream MCP servers."""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.models.orm import McpServer, ServerStatus
from app.observability.metrics import UPSTREAM_CONSECUTIVE_FAILURES, UPSTREAM_HEALTH

logger = structlog.get_logger(__name__)

# P3: bound concurrent probes so a 500-server fleet doesn't fan out 500
# simultaneous connections (or serialize O(N) for minutes).
PROBE_CONCURRENCY = 10


@dataclass(frozen=True)
class _ProbeTarget:
    tenant_id: object
    slug: str
    upstream_url: str
    health_check_path: str


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
        """Probe a single server's health endpoint (manual trigger path).

        Updates the ORM object in place via `_apply_result`; the caller owns
        the commit (endpoint commits, `run_once` uses per-server sessions).
        """
        healthy = await self._check_url(server.upstream_url, server.health_check_path)
        self._apply_result(server, healthy)
        return healthy

    async def run_once(self) -> None:
        """Probe all active/unhealthy servers with bounded concurrency (P3).

        Previously one session stayed open across sequential network probes
        with a single commit at the end — a long-lived txn that starved the
        pool and scaled O(N). Now: short read txn for targets, concurrent
        network probes (semaphore + jitter), then one short write txn per
        server.
        """
        from app.repositories.servers import ServerRepository

        async with self._session_factory() as session:
            result = await session.execute(
                select(
                    McpServer.tenant_id,
                    McpServer.slug,
                    McpServer.upstream_url,
                    McpServer.health_check_path,
                ).where(McpServer.status.in_([ServerStatus.ACTIVE, ServerStatus.UNHEALTHY]))
            )
            targets = [_ProbeTarget(*row) for row in result.all()]

        semaphore = asyncio.Semaphore(PROBE_CONCURRENCY)

        async def _probe_one(target: _ProbeTarget) -> tuple[_ProbeTarget, bool]:
            async with semaphore:
                # P3: jitter breaks replica thundering herds.
                await asyncio.sleep(random.uniform(0, 1.0))
                healthy = await self._check_url(target.upstream_url, target.health_check_path)
                return target, healthy

        results = await asyncio.gather(*(_probe_one(t) for t in targets))

        for target, healthy in results:
            try:
                async with self._session_factory() as session:
                    repo = ServerRepository(session)
                    server = await repo.get_by_slug(target.tenant_id, target.slug)  # type: ignore[arg-type]
                    if server is None:
                        continue
                    self._apply_result(server, healthy)
                    await session.commit()
            except Exception:  # noqa: BLE001 - one bad row must not fail the pass
                logger.exception("health_monitor.persist_failed", slug=target.slug)

    async def _check_url(self, upstream_url: str, health_check_path: str) -> bool:
        """Network-only health check (no DB touch)."""
        url = f"{upstream_url.rstrip('/')}{health_check_path}"
        timeout = httpx.Timeout(
            self._settings.upstream_read_timeout_seconds,
            connect=self._settings.upstream_connect_timeout_seconds,
        )
        try:
            response = await self._http_client.get(
                url,
                timeout=timeout,
                follow_redirects=False,
            )
            return response.status_code < 400
        except Exception:  # noqa: BLE001
            return False

    def _apply_result(self, server: McpServer, healthy: bool) -> None:
        """Apply a probe outcome to an ORM object (caller commits)."""
        server.last_health_check_at = datetime.now(UTC)
        if healthy:
            server.consecutive_health_failures = 0
            UPSTREAM_HEALTH.labels(server_slug=server.slug).set(1)
            UPSTREAM_CONSECUTIVE_FAILURES.labels(server_slug=server.slug).set(0)
            if server.status == ServerStatus.UNHEALTHY:
                server.status = ServerStatus.ACTIVE
                logger.info("health_monitor.recovered", slug=server.slug)
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
                logger.error("health_monitor.marked_unhealthy", slug=server.slug)

    async def start(self) -> None:
        """Run the health monitor loop until ``stop()`` is called (P3: jittered)."""
        logger.info("health_monitor.started")
        while not self._stop_event.is_set():
            try:
                await self.run_once()
            except Exception:
                logger.exception("health_monitor.run_once_failed")

            # P3: jittered interval breaks multi-replica thundering herds.
            interval = self._settings.health_check_interval_seconds * random.uniform(0.9, 1.1)
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=interval,
                )
            except TimeoutError:
                pass

        logger.info("health_monitor.stopped")

    async def stop(self) -> None:
        """Signal the monitor loop to shut down."""
        self._stop_event.set()
