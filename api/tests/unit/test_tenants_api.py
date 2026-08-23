"""Unit tests for POST /admin/tenants — platform-admin tenant provisioning."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.auth.dependencies import platform_admin_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import SubjectType, UserApprovalStatus
from app.models.schemas import TenantView
from app.provisioning import ProvisioningError

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


def _make_api_key_mock() -> MagicMock:
    key = MagicMock()
    key.user_id = ISSUER_ID
    return key


def _make_admin_mock() -> MagicMock:
    user = MagicMock()
    user.id = ISSUER_ID
    user.email = "owner@example.com"
    user.full_name = "Owner"
    user.org_name = None
    user.intended_use = None
    user.is_active = True
    user.approval_status = UserApprovalStatus.APPROVED
    user.is_platform_admin = True
    user.access_token = None
    user.created_at = NOW
    user.updated_at = NOW
    return user


def _make_result_mock() -> MagicMock:
    result = MagicMock()

    result.tenant = MagicMock()
    result.tenant.id = UUID("00000000-0000-0000-0000-00000000000f")
    result.tenant.name = "Acme Inc"
    result.tenant.slug = "acme"
    result.tenant.created_at = NOW
    result.tenant.plan = None

    result.owner = MagicMock()
    result.owner.id = UUID("00000000-0000-0000-0000-0000000000aa")
    result.owner.email = "owner@acme.test"
    result.owner.full_name = "Ada Owner"
    result.owner.org_name = "Acme Inc"
    result.owner.intended_use = None
    result.owner.is_active = True
    result.owner.approval_status = UserApprovalStatus.APPROVED
    result.owner.is_platform_admin = False
    result.owner.org_role = "org_owner"
    result.owner.access_token = None
    result.owner.created_at = NOW
    result.owner.updated_at = NOW

    result.access_token = "pk_abcdefgh_" + "a" * 43
    result.owner_password = "generated-password"
    result.license_key = "lc_plaintext"

    result.license = MagicMock()
    result.license.id = UUID("00000000-0000-0000-0000-0000000000bb")
    result.license.plan = "pro"
    result.license.status = "active"
    result.license.seat_limit = 5
    result.license.server_limit = None
    result.license.issued_at = NOW
    result.license.expires_at = NOW
    result.license.revoked_at = None
    result.license.licensee = "Acme Inc"
    result.license.created_at = NOW
    result.license.updated_at = NOW
    return result


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


@pytest.mark.asyncio
async def test_provision_tenant_returns_201_with_credentials() -> None:
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()
    result = _make_result_mock()

    with (
        patch(
            "app.api.tenants._resolve_admin_user",
            new_callable=AsyncMock,
            return_value=(_make_api_key_mock(), _make_admin_mock()),
        ),
        patch(
            "app.api.tenants.ProvisioningService",
            return_value=MagicMock(provision_tenant=AsyncMock(return_value=result)),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/admin/tenants",
                json={
                    "name": "Acme Inc",
                    "slug": "acme",
                    "owner_email": "owner@acme.test",
                    "owner_full_name": "Ada Owner",
                },
            )

    assert response.status_code == 201
    body = response.json()
    assert body["tenant"]["slug"] == "acme"
    assert body["owner"]["email"] == "owner@acme.test"
    assert body["access_token"].startswith("pk_")
    assert body["owner_password"] == "generated-password"
    assert body["license_key"] == "lc_plaintext"


@pytest.mark.asyncio
async def test_provision_tenant_omits_echoed_password_when_client_provided() -> None:
    """A client-supplied password is not echoed back in the response."""
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()
    result = _make_result_mock()

    with (
        patch(
            "app.api.tenants._resolve_admin_user",
            new_callable=AsyncMock,
            return_value=(_make_api_key_mock(), _make_admin_mock()),
        ),
        patch(
            "app.api.tenants.ProvisioningService",
            return_value=MagicMock(provision_tenant=AsyncMock(return_value=result)),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/admin/tenants",
                json={
                    "name": "Acme Inc",
                    "slug": "acme",
                    "owner_email": "owner@acme.test",
                    "owner_full_name": "Ada Owner",
                    "owner_password": "client-supplied-pw",
                },
            )

    assert response.status_code == 201
    body = response.json()
    assert body["owner_password"] is None


@pytest.mark.asyncio
async def test_provision_tenant_conflict_on_duplicate_slug() -> None:
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    with (
        patch(
            "app.api.tenants._resolve_admin_user",
            new_callable=AsyncMock,
            return_value=(_make_api_key_mock(), _make_admin_mock()),
        ),
        patch(
            "app.api.tenants.ProvisioningService",
            return_value=MagicMock(
                provision_tenant=AsyncMock(
                    side_effect=ProvisioningError("tenant slug already in use: acme")
                )
            ),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/admin/tenants",
                json={
                    "name": "Acme Inc",
                    "slug": "acme",
                    "owner_email": "owner@acme.test",
                    "owner_full_name": "Ada Owner",
                },
            )

    assert response.status_code == 409
    assert "already in use" in response.json()["detail"]


@pytest.mark.asyncio
async def test_provision_tenant_rejects_invalid_slug() -> None:
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response: Response = await client.post(
            "/admin/tenants",
            json={
                "name": "Acme Inc",
                "slug": "!!!",
                "owner_email": "owner@acme.test",
                "owner_full_name": "Ada Owner",
            },
        )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_tenants_returns_tenants() -> None:
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()
    tenant = MagicMock()
    tenant.id = UUID("00000000-0000-0000-0000-00000000000f")
    tenant.name = "Acme Inc"
    tenant.slug = "acme"
    tenant.created_at = NOW
    tenant.plan = "pro"

    with (
        patch(
            "app.api.tenants._list_tenants_with_plan",
            new_callable=AsyncMock,
            return_value=[TenantView.model_validate(tenant)],
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get("/admin/tenants")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["slug"] == "acme"