"""Unit tests for the self-host telemetry endpoint and repository."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import authenticated_subject, platform_admin_subject
from app.auth.subject import Subject
from app.config import Settings
from app.main import create_app
from app.models.orm import Instance, SubjectType
from app.models.schemas import InstanceSummaryView
from app.repositories.instances import InstanceRepository

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")

INSTALL_ID = UUID("11111111-1111-1111-1111-111111111111")


def _settings(**overrides) -> Settings:
    base = {"_env_file": None, "telemetry_enabled": True}
    base.update(overrides)
    return Settings(**base)


def _make_subject() -> Subject:
    return Subject(
        subject_id=str(UUID("00000000-0000-0000-0000-0000000000cd")),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_app() -> FastAPI:
    app = create_app()
    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()
    return app


def _instance() -> Instance:
    now = datetime.now(UTC)
    return Instance(
        install_id=INSTALL_ID,
        version="0.8.0",
        server_count=3,
        first_seen_at=now,
        last_seen_at=now,
    )


class TestInstanceRepository:
    async def test_upsert_creates_new_row(self) -> None:
        session = AsyncMock()
        session.scalar = AsyncMock(return_value=None)
        session.add = MagicMock()
        session.flush = AsyncMock()

        repo = InstanceRepository(session)
        row = await repo.upsert_heartbeat(
            INSTALL_ID, version="0.8.0", server_count=3
        )
        assert row.install_id == INSTALL_ID
        assert row.version == "0.8.0"
        assert row.server_count == 3
        session.add.assert_called_once()
        session.flush.assert_awaited_once()

    async def test_upsert_updates_existing_row(self) -> None:
        session = AsyncMock()
        existing = _instance()
        existing.server_count = 1
        session.scalar = AsyncMock(return_value=existing)

        repo = InstanceRepository(session)
        row = await repo.upsert_heartbeat(
            INSTALL_ID, version="0.8.1", server_count=5
        )
        assert row is existing
        assert row.version == "0.8.1"
        assert row.server_count == 5
        session.add.assert_not_called()

    async def test_counts_returns_total_and_active(self) -> None:
        session = AsyncMock()
        session.scalar = AsyncMock(side_effect=[7, 2])

        repo = InstanceRepository(session)
        counts = await repo.counts()
        assert counts == {"total": 7, "active_24h": 2}


@pytest.mark.asyncio
class TestTelemetryApi:
    async def test_heartbeat_records_and_commits(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        session = AsyncMock()
        app.dependency_overrides[get_session] = lambda: session

        with patch.object(
            InstanceRepository,
            "upsert_heartbeat",
            new_callable=AsyncMock,
            return_value=_instance(),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response: Response = await client.post(
                    "/v1/telemetry/heartbeat",
                    json={
                        "install_id": str(INSTALL_ID),
                        "version": "0.8.0",
                        "server_count": 3,
                    },
                )

        assert response.status_code == 200
        body = response.json()
        assert body["install_id"] == str(INSTALL_ID)
        assert body["version"] == "0.8.0"
        assert body["server_count"] == 3
        session.commit.assert_awaited_once()

    async def test_heartbeat_404_when_disabled(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings(
            telemetry_enabled=False
        )
        app.dependency_overrides[get_session] = lambda: AsyncMock()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/v1/telemetry/heartbeat",
                json={
                    "install_id": str(INSTALL_ID),
                    "version": "0.8.0",
                    "server_count": 1,
                },
            )

        assert response.status_code == 404

    async def test_heartbeat_rejects_invalid_payload(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        app.dependency_overrides[get_session] = lambda: AsyncMock()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/v1/telemetry/heartbeat",
                json={"install_id": "not-a-uuid", "version": "", "server_count": -1},
            )

        assert response.status_code == 422

    async def test_admin_summary_returns_counts(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        session = AsyncMock()
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        with patch.object(
            InstanceRepository,
            "counts",
            new_callable=AsyncMock,
            return_value={"total": 7, "active_24h": 2},
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response: Response = await client.get("/admin/telemetry/summary")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 7
        assert body["active_24h"] == 2

    async def test_admin_instances_lists_records(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _settings()
        session = AsyncMock()
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        with patch.object(
            InstanceRepository,
            "list_instances",
            new_callable=AsyncMock,
            return_value=[_instance()],
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response: Response = await client.get("/admin/telemetry/instances")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["install_id"] == str(INSTALL_ID)
        assert body[0]["version"] == "0.8.0"


class TestInstanceSummaryViewSchema:
    def test_summary_builds_from_dict(self) -> None:
        view = InstanceSummaryView(total=7, active_24h=2)
        assert view.total == 7
        assert view.active_24h == 2