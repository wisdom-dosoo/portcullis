"""Unit tests for the self-host telemetry client (identity + reporter)."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from app.telemetry.identity import InstallIdentity
from app.telemetry.reporter import TelemetryReporter


class TestInstallIdentity:
    def test_pinned_id_wins(self) -> None:
        identity = InstallIdentity(
            install_id="11111111-1111-1111-1111-111111111111",
            state_file="unused/path",
        )
        assert identity.install_id == UUID("11111111-1111-1111-1111-111111111111")

    def test_generates_and_persists_when_missing(self, tmp_path: Path) -> None:
        state = tmp_path / "nested" / "install_id"
        identity = InstallIdentity(state_file=str(state))
        first = identity.install_id
        assert state.exists()
        assert state.read_text(encoding="utf-8").strip() == str(first)

    def test_reuses_existing_state(self, tmp_path: Path) -> None:
        state = tmp_path / "install_id"
        state.write_text("22222222-2222-2222-2222-222222222222", encoding="utf-8")
        identity = InstallIdentity(state_file=str(state))
        assert identity.install_id == UUID("22222222-2222-2222-2222-222222222222")

    def test_stable_across_restarts(self, tmp_path: Path) -> None:
        state = tmp_path / "install_id"
        first = InstallIdentity(state_file=str(state)).install_id
        second = InstallIdentity(state_file=str(state)).install_id
        assert first == second

    def test_corrupt_state_regenerates(self, tmp_path: Path) -> None:
        state = tmp_path / "install_id"
        state.write_text("not-a-uuid", encoding="utf-8")
        identity = InstallIdentity(state_file=str(state))
        assert identity.install_id is not None


class TestTelemetryReporter:
    def _settings(self, **overrides):
        from app.config import Settings

        base = {
            "_env_file": None,
            "telemetry_enabled": True,
            "telemetry_endpoint_url": "https://telemetry.example.com",
            "telemetry_interval_seconds": 3600,
        }
        base.update(overrides)
        return Settings(**base)

    def _reporter(self, settings, http_client=None):
        session_factory = MagicMock()
        session = AsyncMock()
        session_ctx = AsyncMock()
        session_ctx.__aenter__ = AsyncMock(return_value=session)
        session_ctx.__aexit__ = AsyncMock(return_value=False)
        session_factory.return_value = session_ctx
        identity = InstallIdentity(install_id="11111111-1111-1111-1111-111111111111")
        client = http_client or AsyncMock()
        return TelemetryReporter(
            settings=settings,
            session_factory=session_factory,
            http_client=client,
            identity=identity,
        )

    @pytest.mark.asyncio
    async def test_run_once_sends_heartbeat_with_payload(self) -> None:
        settings = self._settings()
        client = AsyncMock()
        response = MagicMock()
        response.status_code = 200
        client.post = AsyncMock(return_value=response)
        reporter = self._reporter(settings, http_client=client)
        reporter._session_factory.return_value.__aenter__.return_value.scalar = (
            AsyncMock(return_value=3)
        )

        await reporter.run_once()

        client.post.assert_awaited_once()
        args, kwargs = client.post.call_args
        assert args[0].endswith("/v1/telemetry/heartbeat")
        assert kwargs["json"] == {
            "install_id": "11111111-1111-1111-1111-111111111111",
            "version": "0.8.0",
            "server_count": 3,
        }

    @pytest.mark.asyncio
    async def test_run_once_survives_network_error(self) -> None:
        settings = self._settings()
        client = AsyncMock()
        client.post = AsyncMock(side_effect=Exception("boom"))
        reporter = self._reporter(settings, http_client=client)
        reporter._session_factory.return_value.__aenter__.return_value.scalar = (
            AsyncMock(return_value=0)
        )

        await reporter.run_once()  # must not raise

    @pytest.mark.asyncio
    async def test_run_once_logs_non_200(self) -> None:
        settings = self._settings()
        client = AsyncMock()
        response = MagicMock()
        response.status_code = 404
        client.post = AsyncMock(return_value=response)
        reporter = self._reporter(settings, http_client=client)
        reporter._session_factory.return_value.__aenter__.return_value.scalar = (
            AsyncMock(return_value=1)
        )

        await reporter.run_once()  # must not raise

    @pytest.mark.asyncio
    async def test_start_stops_cleanly(self) -> None:
        settings = self._settings(telemetry_interval_seconds=1)
        reporter = self._reporter(settings)

        task = asyncio.create_task(reporter.start())
        await asyncio.sleep(0.05)
        await reporter.stop()
        await asyncio.wait_for(task, timeout=2)
        assert task.done()

    def test_endpoint_url_normalizes_trailing_slash(self) -> None:
        settings = self._settings(
            telemetry_endpoint_url="https://telemetry.example.com/"
        )
        reporter = self._reporter(settings)
        assert reporter._endpoint_url() == (
            "https://telemetry.example.com/v1/telemetry/heartbeat"
        )