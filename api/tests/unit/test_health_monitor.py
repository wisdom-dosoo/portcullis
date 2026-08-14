"""Unit tests for the HealthMonitor background service."""

from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config import Settings
from app.gateway.health_monitor import HealthMonitor
from app.models.orm import ServerStatus

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_settings(
    *,
    interval: float = 30.0,
    failure_threshold: int = 3,
    connect_timeout: float = 5.0,
    read_timeout: float = 30.0,
) -> Settings:
    return Settings(
        _env_file=None,
        health_check_interval_seconds=interval,
        health_check_failure_threshold=failure_threshold,
        upstream_connect_timeout_seconds=connect_timeout,
        upstream_read_timeout_seconds=read_timeout,
    )


def _make_server(
    slug: str = "test-server",
    status: ServerStatus = ServerStatus.ACTIVE,
    consecutive_failures: int = 0,
    upstream_url: str = "http://localhost",
    health_check_path: str = "/health",
) -> MagicMock:
    server = MagicMock()
    server.slug = slug
    server.status = status
    server.consecutive_health_failures = consecutive_failures
    server.upstream_url = upstream_url
    server.health_check_path = health_check_path
    server.last_health_check_at = None
    return server


def _make_monitor(
    settings: Settings | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> tuple[HealthMonitor, MagicMock]:
    if settings is None:
        settings = _make_settings()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_session_factory = MagicMock(return_value=mock_session_ctx)

    if http_client is None:
        http_client = AsyncMock(spec=httpx.AsyncClient)

    monitor = HealthMonitor(
        session_factory=mock_session_factory,
        http_client=http_client,
        settings=settings,
    )
    return monitor, mock_session


# ---------------------------------------------------------------------------
# probe() — success path
# ---------------------------------------------------------------------------


class TestProbeSuccess:
    @pytest.mark.asyncio
    async def test_successful_probe_resets_failures(self) -> None:
        server = _make_server(consecutive_failures=2)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        result = await monitor.probe(server)

        assert result is True
        assert server.consecutive_health_failures == 0
        assert server.last_health_check_at is not None

    @pytest.mark.asyncio
    async def test_successful_probe_recovers_unhealthy_server(self) -> None:
        server = _make_server(status=ServerStatus.UNHEALTHY, consecutive_failures=5)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        result = await monitor.probe(server)

        assert result is True
        assert server.status == ServerStatus.ACTIVE
        assert server.consecutive_health_failures == 0

    @pytest.mark.asyncio
    async def test_successful_probe_does_not_change_active_status(self) -> None:
        server = _make_server(status=ServerStatus.ACTIVE)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 204
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        await monitor.probe(server)

        assert server.status == ServerStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_probe_uses_correct_url(self) -> None:
        server = _make_server(upstream_url="http://mcp.internal", health_check_path="/healthz")
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        await monitor.probe(server)

        called_url = mock_client.get.call_args[0][0]
        assert called_url == "http://mcp.internal/healthz"

    @pytest.mark.asyncio
    async def test_probe_uses_no_redirects(self) -> None:
        server = _make_server()
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        await monitor.probe(server)

        kwargs = mock_client.get.call_args[1]
        assert kwargs.get("follow_redirects") is False

    @pytest.mark.asyncio
    async def test_probe_status_399_is_healthy(self) -> None:
        server = _make_server()
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 399
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        result = await monitor.probe(server)

        assert result is True

    @pytest.mark.asyncio
    async def test_probe_status_400_is_unhealthy(self) -> None:
        server = _make_server()
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        result = await monitor.probe(server)

        assert result is False


# ---------------------------------------------------------------------------
# probe() — failure path
# ---------------------------------------------------------------------------


class TestProbeFailure:
    @pytest.mark.asyncio
    async def test_failed_probe_increments_failure_count(self) -> None:
        server = _make_server(consecutive_failures=0)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(http_client=mock_client)
        result = await monitor.probe(server)

        assert result is False
        assert server.consecutive_health_failures == 1

    @pytest.mark.asyncio
    async def test_failure_threshold_triggers_unhealthy(self) -> None:
        settings = _make_settings(failure_threshold=3)
        server = _make_server(consecutive_failures=2)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(settings=settings, http_client=mock_client)
        await monitor.probe(server)

        assert server.consecutive_health_failures == 3
        assert server.status == ServerStatus.UNHEALTHY

    @pytest.mark.asyncio
    async def test_below_threshold_does_not_mark_unhealthy(self) -> None:
        settings = _make_settings(failure_threshold=3)
        server = _make_server(consecutive_failures=1, status=ServerStatus.ACTIVE)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, _ = _make_monitor(settings=settings, http_client=mock_client)
        await monitor.probe(server)

        assert server.consecutive_health_failures == 2
        assert server.status == ServerStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_network_exception_counts_as_failure(self) -> None:
        server = _make_server(consecutive_failures=0)
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("timeout"))

        monitor, _ = _make_monitor(http_client=mock_client)
        result = await monitor.probe(server)

        assert result is False
        assert server.consecutive_health_failures == 1
        assert server.last_health_check_at is not None

    @pytest.mark.asyncio
    async def test_last_health_check_at_updated_on_failure(self) -> None:
        server = _make_server()
        assert server.last_health_check_at is None
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get = AsyncMock(side_effect=Exception("error"))

        monitor, _ = _make_monitor(http_client=mock_client)
        await monitor.probe(server)

        assert server.last_health_check_at is not None
        assert isinstance(server.last_health_check_at, datetime)


# ---------------------------------------------------------------------------
# run_once() — integration
# ---------------------------------------------------------------------------


class TestRunOnce:
    @pytest.mark.asyncio
    async def test_run_once_probes_active_servers(self) -> None:
        settings = _make_settings()
        active_server = _make_server(slug="active", status=ServerStatus.ACTIVE)
        unhealthy_server = _make_server(slug="unhealthy", status=ServerStatus.UNHEALTHY)

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, mock_session = _make_monitor(settings=settings, http_client=mock_client)

        # Mock the database query to return active and unhealthy servers
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [active_server, unhealthy_server]
        mock_session.execute = AsyncMock(return_value=mock_result)

        await monitor.run_once()

        # Both were probed
        assert mock_client.get.call_count == 2
        # Session was committed
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_run_once_skips_disabled_servers(self) -> None:
        """DISABLED servers are excluded by the query; verify only active+unhealthy queried."""
        settings = _make_settings()
        active_server = _make_server(slug="active", status=ServerStatus.ACTIVE)

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        monitor, mock_session = _make_monitor(settings=settings, http_client=mock_client)

        # Only active server in the result (DISABLED excluded by query filter)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [active_server]
        mock_session.execute = AsyncMock(return_value=mock_result)

        await monitor.run_once()

        # Verify query was executed (disabled servers excluded by the WHERE clause)
        mock_session.execute.assert_awaited_once()
        assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_run_once_with_no_servers_does_nothing(self) -> None:
        monitor, mock_session = _make_monitor()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        await monitor.run_once()

        mock_session.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# start() / stop() — lifecycle
# ---------------------------------------------------------------------------


class TestMonitorLifecycle:
    @pytest.mark.asyncio
    async def test_stop_signals_shutdown(self) -> None:
        monitor, mock_session = _make_monitor(settings=_make_settings(interval=3600.0))
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        # Start the monitor then immediately stop it
        task = asyncio.create_task(monitor.start())
        await asyncio.sleep(0)  # allow task to begin
        await monitor.stop()
        await asyncio.wait_for(task, timeout=2.0)

        assert monitor._stop_event.is_set()
