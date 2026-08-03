"""Unit tests for the /v1/servers API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import ServerAuthMode, ServerStatus, ServerTransport
from app.models.schemas import ServerView

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
SERVER_ID = UUID("00000000-0000-0000-0000-000000000099")
NOW = datetime.now(UTC)


def _make_server_view(
    slug: str = "my-server",
    status: ServerStatus = ServerStatus.ACTIVE,
) -> ServerView:
    return ServerView(
        id=SERVER_ID,
        tenant_id=DEFAULT_TENANT_ID,
        name="My Server",
        slug=slug,
        upstream_url="http://localhost/mcp",
        transport=ServerTransport.STREAMABLE_HTTP,
        auth_mode=ServerAuthMode.NONE,
        status=status,
        health_check_path="/health",
        consecutive_health_failures=0,
        last_health_check_at=None,
        created_at=NOW,
        updated_at=NOW,
    )


def _make_app_with_mock_runtime() -> tuple[FastAPI, MagicMock]:
    """Create the app and replace its runtime with a mock."""
    app = create_app()
    mock_runtime = MagicMock()
    # session_factory is used as a context manager
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime

    # Add a mock monitor
    mock_monitor = AsyncMock()
    app.state.monitor = mock_monitor

    # Override auth dependencies so routes don't require a real API key
    fake_subject = Subject(
        key_id=SERVER_ID,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )
    app.dependency_overrides[admin_subject] = lambda: fake_subject
    app.dependency_overrides[authenticated_subject] = lambda: fake_subject

    return app, mock_runtime


# ---------------------------------------------------------------------------
# POST /v1/servers — create
# ---------------------------------------------------------------------------


class TestCreateServer:
    @pytest.mark.asyncio
    async def test_create_returns_201_with_server_view(self) -> None:
        app, _ = _make_app_with_mock_runtime()
        view = _make_server_view()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.create = AsyncMock(return_value=view)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/v1/servers",
                    json={
                        "name": "My Server",
                        "slug": "my-server",
                        "upstream_url": "http://localhost/mcp",
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["slug"] == "my-server"
        assert body["status"] == "active"

    @pytest.mark.asyncio
    async def test_create_with_validation_error_returns_422(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.create = AsyncMock(side_effect=ValueError("slug already exists"))

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/v1/servers",
                    json={
                        "name": "My Server",
                        "slug": "my-server",
                        "upstream_url": "http://localhost/mcp",
                    },
                )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_with_invalid_body_returns_422(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Missing required fields
            resp = await client.post("/v1/servers", json={"name": "X"})

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /v1/servers — list
# ---------------------------------------------------------------------------


class TestListServers:
    @pytest.mark.asyncio
    async def test_list_returns_200_with_server_list(self) -> None:
        app, _ = _make_app_with_mock_runtime()
        views = [_make_server_view("server-a"), _make_server_view("server-b")]

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.list = AsyncMock(return_value=views)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/servers")

        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2
        slugs = {item["slug"] for item in body}
        assert slugs == {"server-a", "server-b"}

    @pytest.mark.asyncio
    async def test_list_empty_returns_empty_list(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.list = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/servers")

        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# GET /v1/servers/{slug} — get single
# ---------------------------------------------------------------------------


class TestGetServer:
    @pytest.mark.asyncio
    async def test_get_existing_returns_200(self) -> None:
        app, _ = _make_app_with_mock_runtime()
        view = _make_server_view("my-server")

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.get = AsyncMock(return_value=view)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/servers/my-server")

        assert resp.status_code == 200
        assert resp.json()["slug"] == "my-server"

    @pytest.mark.asyncio
    async def test_get_missing_returns_404(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.get = AsyncMock(side_effect=KeyError("not found"))

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/servers/missing")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /v1/servers/{slug} — update
# ---------------------------------------------------------------------------


class TestUpdateServer:
    @pytest.mark.asyncio
    async def test_update_existing_returns_200(self) -> None:
        app, _ = _make_app_with_mock_runtime()
        updated = _make_server_view("my-server")
        updated = updated.model_copy(update={"name": "Updated"})

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.update = AsyncMock(return_value=updated)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.patch(
                    "/v1/servers/my-server",
                    json={"name": "Updated"},
                )

        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_update_missing_returns_404(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.update = AsyncMock(side_effect=KeyError("not found"))

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.patch(
                    "/v1/servers/missing",
                    json={"name": "X"},
                )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_with_invalid_url_returns_422(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.update = AsyncMock(side_effect=ValueError("HTTPS required"))

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.patch(
                    "/v1/servers/my-server",
                    json={"upstream_url": "http://mcp.internal/mcp"},
                )

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /v1/servers/{slug}
# ---------------------------------------------------------------------------


class TestDeleteServer:
    @pytest.mark.asyncio
    async def test_delete_existing_returns_204(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.delete = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete("/v1/servers/my-server")

        assert resp.status_code == 204
        assert resp.content == b""

    @pytest.mark.asyncio
    async def test_delete_missing_returns_404(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.RegistryService") as MockSvc:
            instance = MockSvc.return_value
            instance.delete = AsyncMock(side_effect=KeyError("not found"))

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete("/v1/servers/missing")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /v1/servers/{slug}/health — trigger probe
# ---------------------------------------------------------------------------


class TestTriggerHealthProbe:
    @pytest.mark.asyncio
    async def test_trigger_probe_returns_200_with_status(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        fake_server = MagicMock()
        fake_server.slug = "my-server"
        fake_server.status = ServerStatus.ACTIVE

        with patch("app.api.servers.ServerRepository") as MockRepo:
            mock_repo_instance = MockRepo.return_value
            mock_repo_instance.get_by_slug = AsyncMock(return_value=fake_server)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post("/v1/servers/my-server/health")

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "active"
        # Verify the monitor's probe was called
        app.state.monitor.probe.assert_awaited_once_with(fake_server)

    @pytest.mark.asyncio
    async def test_trigger_probe_missing_server_returns_404(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.servers.ServerRepository") as MockRepo:
            mock_repo_instance = MockRepo.return_value
            mock_repo_instance.get_by_slug = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post("/v1/servers/missing/health")

        assert resp.status_code == 404
