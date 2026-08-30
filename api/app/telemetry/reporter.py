"""Opt-in background heartbeat reporter for self-host installs."""

from __future__ import annotations

import asyncio

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import __version__
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import McpServer
from app.telemetry.identity import InstallIdentity

logger = structlog.get_logger(__name__)


class TelemetryReporter:
    """Periodically sends the anonymous install heartbeat.

    The sender is the self-host half of Phase 4 telemetry: when the operator
    enables it and points ``telemetry_endpoint_url`` at their
    ``/v1/telemetry/heartbeat``, each install reports its anonymous install
    id, the running version, and how many MCP servers it has registered.  The
    receive side aggregates these into the install counts the Phase 4 review
    needs.  Everything here is best-effort — a failure to send is logged and
    retried next interval, never fatal.
    """

    def __init__(
        self,
        *,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        http_client: httpx.AsyncClient,
        identity: InstallIdentity,
    ) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._http_client = http_client
        self._identity = identity
        self._stop_event = asyncio.Event()

    def _endpoint_url(self) -> str:
        return f"{self._settings.telemetry_endpoint_url.rstrip('/')}/v1/telemetry/heartbeat"

    async def run_once(self) -> None:
        """Send one heartbeat, counting registered servers as we go."""
        async with self._session_factory() as session:
            result = await session.scalar(
                select(func.count(McpServer.id)).where(McpServer.tenant_id == DEFAULT_TENANT_ID)
            )
            server_count = int(result or 0)

        payload = {
            "install_id": str(self._identity.install_id),
            "version": __version__,
            "server_count": server_count,
        }
        try:
            response = await self._http_client.post(
                self._endpoint_url(),
                json=payload,
                timeout=self._settings.upstream_read_timeout_seconds,
            )
            if response.status_code == 200:
                logger.info("telemetry.heartbeat_sent", install_id=payload["install_id"])
            else:
                logger.warning(
                    "telemetry.heartbeat_rejected",
                    status_code=response.status_code,
                )
        except Exception:  # noqa: BLE001
            logger.warning("telemetry.heartbeat_failed")

    async def start(self) -> None:
        """Run the heartbeat loop until ``stop()`` is called."""
        logger.info(
            "telemetry.reporter.started",
            endpoint=self._settings.telemetry_endpoint_url,
            interval_seconds=self._settings.telemetry_interval_seconds,
        )
        while not self._stop_event.is_set():
            try:
                await self.run_once()
            except Exception:
                logger.exception("telemetry.run_once_failed")

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self._settings.telemetry_interval_seconds,
                )
            except TimeoutError:
                pass

        logger.info("telemetry.reporter.stopped")

    async def stop(self) -> None:
        """Signal the reporter loop to shut down."""
        self._stop_event.set()


__all__ = ["TelemetryReporter"]
