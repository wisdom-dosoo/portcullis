"""Unit tests for the /v1/audit API endpoint."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.auth.dependencies import admin_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import AuditEventType, SubjectType
from app.models.schemas import AuditLogView

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
AUDIT_ID = UUID("00000000-0000-0000-0000-000000000042")
NOW = datetime.now(UTC)


def _make_audit_log_view(
    event_type: AuditEventType = AuditEventType.TOOL_CALL,
    server_slug: str | None = "my-server",
    outcome: str = "allowed",
) -> AuditLogView:
    return AuditLogView(
        id=AUDIT_ID,
        tenant_id=DEFAULT_TENANT_ID,
        subject_id="subj-abc",
        subject_type=SubjectType.API_KEY,
        event_type=event_type,
        server_slug=server_slug,
        tool_name="some_tool",
        rpc_method="tools/call",
        outcome=outcome,
        client_ip="127.0.0.1",
        request_id="req-001",
        detail={"extra": "info"},
        created_at=NOW,
    )


def _make_app_with_mock_runtime() -> tuple[FastAPI, MagicMock]:
    """Create the app and replace its runtime with a mock."""
    app = create_app()
    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime

    # Add a mock monitor (required by create_app state)
    mock_monitor = AsyncMock()
    app.state.monitor = mock_monitor

    # Override auth dependencies so routes don't require a real API key
    fake_subject = Subject(
        subject_id=str(AUDIT_ID),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )
    app.dependency_overrides[admin_subject] = lambda: fake_subject

    return app, mock_runtime


# ---------------------------------------------------------------------------
# GET /v1/audit — list
# ---------------------------------------------------------------------------


class TestListAuditLogs:
    @pytest.mark.asyncio
    async def test_list_returns_200_with_audit_log_list(self) -> None:
        app, _ = _make_app_with_mock_runtime()
        views = [
            _make_audit_log_view(event_type=AuditEventType.TOOL_CALL),
            _make_audit_log_view(event_type=AuditEventType.AUTH_FAILURE, outcome="denied"),
        ]
        orm_mocks = []
        for v in views:
            m = MagicMock()
            m.id = v.id
            m.tenant_id = v.tenant_id
            m.subject_id = v.subject_id
            m.subject_type = v.subject_type
            m.event_type = v.event_type
            m.server_slug = v.server_slug
            m.tool_name = v.tool_name
            m.rpc_method = v.rpc_method
            m.outcome = v.outcome
            m.client_ip = v.client_ip
            m.request_id = v.request_id
            m.detail = v.detail
            m.created_at = v.created_at
            orm_mocks.append(m)

        with patch("app.api.audit.AuditRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=orm_mocks)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/audit")

        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2
        event_types = {item["event_type"] for item in body}
        assert event_types == {"tool_call", "auth_failure"}

    @pytest.mark.asyncio
    async def test_list_empty_returns_empty_list(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.audit.AuditRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/audit")

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_forwards_event_type_filter(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.audit.AuditRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/audit?event_type=auth_failure")

        assert resp.status_code == 200
        # Verify the repository received the filter
        instance.list.assert_awaited_once()
        call_kwargs = instance.list.call_args.kwargs
        assert call_kwargs["event_type"] == AuditEventType.AUTH_FAILURE

    @pytest.mark.asyncio
    async def test_list_forwards_server_slug_filter(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.audit.AuditRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/audit?server_slug=my-server")

        assert resp.status_code == 200
        instance.list.assert_awaited_once()
        call_kwargs = instance.list.call_args.kwargs
        assert call_kwargs["server_slug"] == "my-server"

    @pytest.mark.asyncio
    async def test_list_forwards_limit_and_offset(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        with patch("app.api.audit.AuditRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/audit?limit=10&offset=20")

        assert resp.status_code == 200
        instance.list.assert_awaited_once()
        call_kwargs = instance.list.call_args.kwargs
        assert call_kwargs["limit"] == 10
        assert call_kwargs["offset"] == 20

    @pytest.mark.asyncio
    async def test_list_exceeding_max_limit_returns_422(self) -> None:
        app, _ = _make_app_with_mock_runtime()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/v1/audit?limit=201")

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_list_unauthenticated_returns_401(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session = AsyncMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()
        # Do NOT override admin_subject — let it run normally (will fail without a key)

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/v1/audit")

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_returns_correct_schema_fields(self) -> None:
        app, _ = _make_app_with_mock_runtime()
        view = _make_audit_log_view()
        orm_mock = MagicMock()
        orm_mock.id = view.id
        orm_mock.tenant_id = view.tenant_id
        orm_mock.subject_id = view.subject_id
        orm_mock.subject_type = view.subject_type
        orm_mock.event_type = view.event_type
        orm_mock.server_slug = view.server_slug
        orm_mock.tool_name = view.tool_name
        orm_mock.rpc_method = view.rpc_method
        orm_mock.outcome = view.outcome
        orm_mock.client_ip = view.client_ip
        orm_mock.request_id = view.request_id
        orm_mock.detail = view.detail
        orm_mock.created_at = view.created_at

        with patch("app.api.audit.AuditRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=[orm_mock])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/audit")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        item = body[0]
        assert item["id"] == str(AUDIT_ID)
        assert item["tenant_id"] == str(DEFAULT_TENANT_ID)
        assert item["event_type"] == "tool_call"
        assert item["outcome"] == "allowed"
        assert item["server_slug"] == "my-server"
        assert item["tool_name"] == "some_tool"
        assert item["detail"] == {"extra": "info"}
