"""Unit tests for tenant-scoped license management (Cloud control-plane hook)."""

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
from app.main import create_app
from app.models.orm import SubjectType, UserApprovalStatus

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
ISSUER_ID = UUID("00000000-0000-0000-0000-0000000000ab")
NOW = datetime.now(UTC)


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


def _make_license_mock() -> MagicMock:
    license = MagicMock()
    license.id = UUID("00000000-0000-0000-0000-0000000000bb")
    license.plan = "pro"
    license.status = "active"
    license.seat_limit = 5
    license.server_limit = None
    license.issued_at = NOW
    license.expires_at = NOW
    license.revoked_at = None
    license.licensee = "Acme Inc"
    license.created_at = NOW
    license.updated_at = NOW
    return license


@pytest.mark.asyncio
async def test_tenant_get_license_returns_usage_view() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    license = _make_license_mock()

    with (
        patch(
            "app.api.licenses.LicenseService",
            return_value=MagicMock(current=AsyncMock(return_value=license)),
        ),
        patch(
            "app.api.licenses.OrgMemberRepository",
            return_value=MagicMock(count=AsyncMock(return_value=3)),
        ),
        patch(
            "app.repositories.servers.ServerRepository",
            return_value=MagicMock(count=AsyncMock(return_value=2)),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get(f"/admin/tenants/{DEFAULT_TENANT_ID}/license")

    assert response.status_code == 200
    body = response.json()
    assert body["plan"] == "pro"
    assert body["seats_used"] == 3
    assert body["servers_used"] == 2
    assert body["seat_limit"] == 5


@pytest.mark.asyncio
async def test_tenant_get_license_returns_null_when_absent() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    with patch(
        "app.api.licenses.LicenseService",
        return_value=MagicMock(current=AsyncMock(return_value=None)),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get(f"/admin/tenants/{DEFAULT_TENANT_ID}/license")

    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_tenant_issue_license_returns_credentials() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    admin = MagicMock()
    admin.id = ISSUER_ID
    admin.email = "ops@example.com"
    admin.full_name = "Ops"
    admin.org_name = None
    admin.intended_use = None
    admin.is_active = True
    admin.approval_status = UserApprovalStatus.APPROVED
    admin.is_platform_admin = True
    admin.access_token = None
    admin.created_at = NOW
    admin.updated_at = NOW

    license = _make_license_mock()

    with (
        patch(
            "app.api.licenses._resolve_admin_user",
            new_callable=AsyncMock,
            return_value=(MagicMock(), admin),
        ),
        patch(
            "app.api.licenses.LicenseService",
            return_value=MagicMock(
                issue=AsyncMock(return_value=(license, "lc_plaintext"))
            ),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                f"/admin/tenants/{DEFAULT_TENANT_ID}/license",
                json={
                    "plan": "pro",
                    "licensee": "Acme Inc",
                    "seat_limit": 5,
                    "expires_in_days": 365,
                },
            )

    assert response.status_code == 201
    body = response.json()
    assert body["license"]["plan"] == "pro"
    assert body["key"] == "lc_plaintext"


@pytest.mark.asyncio
async def test_tenant_revoke_license_returns_view() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    license = _make_license_mock()

    with patch(
        "app.api.licenses.LicenseService",
        return_value=MagicMock(revoke=AsyncMock(return_value=license)),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                f"/admin/tenants/{DEFAULT_TENANT_ID}/license/revoke"
            )

    assert response.status_code == 200
    assert response.json()["plan"] == "pro"


@pytest.mark.asyncio
async def test_tenant_revoke_license_404_when_absent() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    with patch(
        "app.api.licenses.LicenseService",
        return_value=MagicMock(revoke=AsyncMock(return_value=None)),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                f"/admin/tenants/{DEFAULT_TENANT_ID}/license/revoke"
            )

    assert response.status_code == 404