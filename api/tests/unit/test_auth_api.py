"""Unit tests for the /auth email-password endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.auth.dependencies import authenticated_subject
from app.main import create_app
from app.models.orm import SubjectType, UserApprovalStatus
from app.models.schemas import UserView

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)


def _make_orm_user(user_id: UUID | None = None) -> MagicMock:
    obj = MagicMock()
    obj.id = user_id or UUID("00000000-0000-0000-0000-0000000000ab")
    obj.tenant_id = DEFAULT_TENANT_ID
    obj.email = "jane@company.com"
    obj.full_name = "Jane Smith"
    obj.org_name = None
    obj.intended_use = "Developer tooling"
    obj.password_hash = "$argon2id$dummy"
    obj.is_active = True
    obj.approval_status = UserApprovalStatus.APPROVED
    obj.is_platform_admin = False
    obj.access_token = None
    obj.created_at = NOW
    obj.updated_at = NOW
    return obj


def _make_orm_api_key() -> MagicMock:
    obj = MagicMock()
    obj.id = UUID("00000000-0000-0000-0000-0000000000cd")
    obj.user_id = UUID("00000000-0000-0000-0000-0000000000ab")
    obj.tenant_id = DEFAULT_TENANT_ID
    obj.name = "user:jane@company.com"
    obj.key_prefix = "abcdefgh"
    obj.key_hash = "hash"
    obj.scopes = []
    return obj


def _make_subject() -> MagicMock:
    sub = MagicMock()
    sub.subject_id = str(UUID("00000000-0000-0000-0000-0000000000cd"))
    sub.subject_type = SubjectType.API_KEY
    sub.tenant_id = DEFAULT_TENANT_ID
    return sub


def _make_app_with_auth_override() -> FastAPI:
    """Create the app with authenticated_subject overridden."""
    app = create_app()

    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()

    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    return app


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


class TestRegister:
    @pytest.mark.asyncio
    async def test_register_returns_201_with_token(self) -> None:
        app = _make_app_with_auth_override()
        user = _make_orm_user()
        plaintext = "pk_abcdefgh_" + "b" * 43

        with (
            patch("app.api.auth.UserRepository") as MockUsers,
            patch("app.api.auth.issue_key", new_callable=AsyncMock) as mock_issue,
            patch("app.api.auth.PasswordService") as MockPasswords,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)
            mock_users.create = AsyncMock(return_value=user)

            passwords = MockPasswords.return_value
            passwords.hash_password = MagicMock(return_value="hash")

            from app.auth.subject import IssuedKey

            mock_issue.return_value = IssuedKey(
                key_id=user.id,
                plaintext=plaintext,
                prefix="abcdefgh",
                scopes=frozenset(),
            )

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "full_name": "Jane Smith",
                        "email": "JANE@company.com",
                        "password": "hunter2strong",
                        "intended_use": "Developer tooling",
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["access_token"] == plaintext
        assert body["token_type"] == "bearer"
        assert body["user"]["email"] == "jane@company.com"
        assert body["user"]["full_name"] == "Jane Smith"
        assert "password_hash" not in body["user"]

    @pytest.mark.asyncio
    async def test_register_duplicate_email_returns_409(self) -> None:
        app = _make_app_with_auth_override()
        user = _make_orm_user()

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=user)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "full_name": "Jane Smith",
                        "email": "jane@company.com",
                        "password": "hunter2strong",
                    },
                )

        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_register_short_password_returns_422(self) -> None:
        app = _make_app_with_auth_override()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/register",
                json={
                    "full_name": "Jane Smith",
                    "email": "jane@company.com",
                    "password": "short",
                },
            )

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_returns_200_with_token(self) -> None:
        app = _make_app_with_auth_override()
        user = _make_orm_user()
        plaintext = "pk_abcdefgh_" + "c" * 43

        with (
            patch("app.api.auth.UserRepository") as MockUsers,
            patch("app.api.auth.issue_key", new_callable=AsyncMock) as mock_issue,
            patch("app.api.auth.PasswordService") as MockPasswords,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=user)

            passwords = MockPasswords.return_value
            passwords.verify_password = MagicMock(return_value=True)

            from app.auth.subject import IssuedKey

            mock_issue.return_value = IssuedKey(
                key_id=user.id,
                plaintext=plaintext,
                prefix="abcdefgh",
                scopes=frozenset(),
            )

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/login",
                    json={"email": "jane@company.com", "password": "hunter2strong"},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["access_token"] == plaintext
        assert body["user"]["email"] == "jane@company.com"

    @pytest.mark.asyncio
    async def test_login_wrong_password_returns_401(self) -> None:
        app = _make_app_with_auth_override()
        user = _make_orm_user()

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=user)

            with patch("app.api.auth.PasswordService") as MockPasswords:
                passwords = MockPasswords.return_value
                passwords.verify_password = MagicMock(return_value=False)

                transport = ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    resp = await client.post(
                        "/auth/login",
                        json={"email": "jane@company.com", "password": "wrongpassword"},
                    )

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_unknown_email_returns_401(self) -> None:
        app = _make_app_with_auth_override()

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/login",
                    json={"email": "nobody@company.com", "password": "whatever"},
                )

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


class TestMe:
    @pytest.mark.asyncio
    async def test_me_returns_user_for_bound_key(self) -> None:
        app = _make_app_with_auth_override()
        user = _make_orm_user()
        api_key = _make_orm_api_key()

        with (
            patch("app.api.auth.ApiKeyRepository") as MockKeys,
            patch("app.api.auth.UserRepository") as MockUsers,
        ):
            mock_keys = MockKeys.return_value
            mock_keys.get_by_id = AsyncMock(return_value=api_key)

            mock_users = MockUsers.return_value
            mock_users.get_by_id = AsyncMock(return_value=user)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/auth/me")

        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == "jane@company.com"
        assert body["full_name"] == "Jane Smith"
        assert "password_hash" not in body

    @pytest.mark.asyncio
    async def test_me_unbound_key_returns_401(self) -> None:
        app = _make_app_with_auth_override()

        with patch("app.api.auth.ApiKeyRepository") as MockKeys:
            mock_keys = MockKeys.return_value
            mock_keys.get_by_id = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/auth/me")

        assert resp.status_code == 401


class TestPlatformAdminMeSchema:
    def test_platform_admin_me_shape(self) -> None:
        from app.models.schemas import PlatformAdminMe

        user = _make_orm_user()
        user.is_platform_admin = True
        me = PlatformAdminMe(is_platform_admin=True, user=UserView.model_validate(user))
        assert me.is_platform_admin is True
        assert me.user.is_platform_admin is True
