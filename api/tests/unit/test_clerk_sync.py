"""Unit tests for POST /auth/clerk/sync (Clerk session exchange)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.auth.subject import Subject
from app.config import Settings
from app.main import create_app
from app.models.orm import SubjectType, UserApprovalStatus

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)


def _make_settings(**overrides) -> Settings:
    base = {
        "_env_file": None,
        "jwt_jwks_url": "https://clerk.example.test/.well-known/jwks.json",
        "jwt_issuer": "https://clerk.example.test",
        "jwt_audience": "",
        "clerk_secret_key": None,
        "sso_public_base_url": "http://localhost:8000",
    }
    base.update(overrides)
    return Settings(**base)


def _make_orm_user(**overrides) -> MagicMock:
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-0000000000ab")
    user.tenant_id = DEFAULT_TENANT_ID
    user.email = "ada@example.com"
    user.full_name = "Ada"
    user.org_name = None
    user.intended_use = None
    user.is_active = True
    user.approval_status = UserApprovalStatus.APPROVED
    user.is_platform_admin = False
    user.org_role = None
    user.access_token = None
    user.created_at = NOW
    user.updated_at = NOW
    for key, value in overrides.items():
        setattr(user, key, value)
    return user


def _make_clerk_subject() -> Subject:
    return Subject(
        subject_id="user_clerk_123",
        subject_type=SubjectType.OAUTH_SUBJECT,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(),
    )


def _make_app(settings: Settings) -> FastAPI:
    from app.api.dependencies import get_session, get_settings_dep

    app = create_app()
    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()
    app.dependency_overrides[get_settings_dep] = lambda: settings
    app.dependency_overrides[get_session] = lambda: mock_session
    return app


def _verified_claims(email: str = "ada@example.com") -> tuple[Subject, dict]:
    return _make_clerk_subject(), {
        "sub": "user_clerk_123",
        "email": email,
        "name": "Ada",
    }


class TestClerkSync:
    @pytest.mark.asyncio
    async def test_fresh_signup_provisions_owner_and_sets_cookie(self) -> None:
        app = _make_app(_make_settings())
        user = _make_orm_user()

        with (
            patch(
                "app.api.clerk.verify_jwt_with_claims",
                new_callable=AsyncMock,
                return_value=_verified_claims(),
            ),
            patch("app.api.clerk.UserRepository") as MockUsers,
            patch("app.api.clerk.OrgMemberRepository") as MockMembers,
            patch("app.api.clerk.issue_key", new_callable=AsyncMock) as mock_issue,
            patch("app.api.clerk.PasswordService") as MockPasswords,
            patch("app.api.clerk.create_default_roles", new_callable=AsyncMock),
            patch("app.api.clerk.bind_owner_to_org_owner", new_callable=AsyncMock) as mock_bind,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)
            mock_users.get_by_id = AsyncMock(return_value=user)
            mock_users.create = AsyncMock(return_value=user)

            mock_members = MockMembers.return_value
            mock_members.get_by_subject = AsyncMock(return_value=None)
            mock_members.count = AsyncMock(return_value=0)
            mock_members.create = AsyncMock(return_value=MagicMock())

            mock_passwords = MockPasswords.return_value
            mock_passwords.hash_password = MagicMock(return_value="hash")

            from app.auth.subject import IssuedKey

            mock_issue.return_value = IssuedKey(
                key_id=uuid4(),
                plaintext="pk_test_" + "c" * 43,
                prefix="test",
                scopes=frozenset(),
            )

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/auth/clerk/sync",
                    headers={"Authorization": "Bearer clerk-jwt-token"},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["email"] == "ada@example.com"
        assert body["access_token"].startswith("pk_test_")
        assert "portcullis_auth" in resp.cookies
        mock_bind.assert_awaited_once()  # first user owns the system

    @pytest.mark.asyncio
    async def test_missing_bearer_returns_401(self) -> None:
        app = _make_app(_make_settings())
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post("/auth/clerk/sync")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_unconfigured_jwks_returns_503(self) -> None:
        app = _make_app(_make_settings(jwt_jwks_url=None))
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post(
                "/auth/clerk/sync",
                headers={"Authorization": "Bearer clerk-jwt-token"},
            )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_invalid_jwt_returns_401(self) -> None:
        app = _make_app(_make_settings())
        with patch(
            "app.api.clerk.verify_jwt_with_claims",
            new_callable=AsyncMock,
            side_effect=ValueError("invalid bearer token"),
        ):
            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/auth/clerk/sync",
                    headers={"Authorization": "Bearer bogus"},
                )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_known_subject_links_without_reprovisioning(self) -> None:
        app = _make_app(_make_settings())
        user = _make_orm_user()

        with (
            patch(
                "app.api.clerk.verify_jwt_with_claims",
                new_callable=AsyncMock,
                return_value=_verified_claims(),
            ),
            patch("app.api.clerk.UserRepository") as MockUsers,
            patch("app.api.clerk.OrgMemberRepository") as MockMembers,
            patch("app.api.clerk.issue_key", new_callable=AsyncMock) as mock_issue,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=user)
            mock_users.get_by_id = AsyncMock(return_value=user)

            mock_members = MockMembers.return_value
            mock_members.get_by_subject = AsyncMock(return_value=MagicMock())
            mock_members.create = AsyncMock()

            from app.auth.subject import IssuedKey

            mock_issue.return_value = IssuedKey(
                key_id=uuid4(),
                plaintext="pk_test_" + "d" * 43,
                prefix="test",
                scopes=frozenset(),
            )

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/auth/clerk/sync",
                    headers={"Authorization": "Bearer clerk-jwt-token"},
                )

        assert resp.status_code == 200
        mock_users.create.assert_not_called()
        mock_members.create.assert_not_called()
