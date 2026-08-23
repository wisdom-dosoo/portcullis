"""Unit tests for the /admin/platform endpoints."""

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

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
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
    key.user_id = UUID("00000000-0000-0000-0000-0000000000ab")
    return key


def _make_user_mock() -> MagicMock:
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-0000000000ab")
    user.email = "owner@example.com"
    user.full_name = "Owner"
    user.org_name = None
    user.intended_use = None
    user.is_active = True
    user.approval_status = UserApprovalStatus.APPROVED
    user.is_platform_admin = True
    user.org_role = None
    user.access_token = None
    user.created_at = NOW
    user.updated_at = NOW
    return user


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
async def test_platform_admin_me_returns_flag() -> None:
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    with (
        patch("app.api.platform.ApiKeyRepository") as MockKeys,
        patch("app.api.platform.UserRepository") as MockUsers,
    ):
        MockKeys.return_value.get_by_id = AsyncMock(return_value=_make_api_key_mock())
        MockUsers.return_value.get_by_id = AsyncMock(return_value=_make_user_mock())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get("/admin/platform/me")

    assert response.status_code == 200
    body = response.json()
    assert body["is_platform_admin"] is True
    assert body["user"]["email"] == "owner@example.com"
    assert body["user"]["is_platform_admin"] is True


@pytest.mark.asyncio
async def test_platform_admin_me_patches_repos() -> None:
    """The endpoint queries ApiKeyRepository + UserRepository."""
    app = _make_app()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    with (
        patch("app.api.platform.ApiKeyRepository") as MockKeys,
        patch("app.api.platform.UserRepository") as MockUsers,
    ):
        MockKeys.return_value.get_by_id = AsyncMock(return_value=_make_api_key_mock())
        MockUsers.return_value.get_by_id = AsyncMock(return_value=_make_user_mock())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get("/admin/platform/me")

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "owner@example.com"
    assert body["is_platform_admin"] is True
    # auth/me-style repo lookups occur against the request session.
    MockKeys.return_value.get_by_id.assert_awaited_once()
    MockUsers.return_value.get_by_id.assert_awaited_once()
