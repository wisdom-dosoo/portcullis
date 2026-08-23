"""Unit tests for the OIDC SSO auth-code flow (auth module + API endpoints)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import authenticated_subject, platform_admin_subject
from app.auth.sso import (
    SsoError,
    SsoIdentity,
    authorization_url,
    callback_url,
    exchange_code,
    fetch_userinfo,
    make_state,
    verify_state,
)
from app.auth.subject import Subject
from app.config import Settings
from app.main import create_app
from app.models.orm import SubjectType, UserApprovalStatus

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
ISSUER_ID = UUID("00000000-0000-0000-0000-0000000000ab")


def _sso_settings(**overrides) -> Settings:
    base = {
        "_env_file": None,
        "sso_enabled": True,
        "sso_oidc_slug": "keycloak",
        "sso_oidc_client_id": "client-123",
        "sso_oidc_client_secret": "secret-456",
        "sso_oidc_issuer": "https://idp.example.test",
        "sso_oidc_authorize_url": "https://idp.example.test/authorize",
        "sso_oidc_token_url": "https://idp.example.test/token",
        "sso_oidc_userinfo_url": "https://idp.example.test/userinfo",
        "sso_oidc_scope": "openid email profile",
        "sso_public_base_url": "http://localhost:8000",
    }
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


class TestStateAndUrl:
    def test_state_round_trips(self) -> None:
        settings = _sso_settings()
        state = make_state(settings)
        assert "." in state
        assert verify_state(state, settings)

    def test_state_rejects_tampered_nonce(self) -> None:
        settings = _sso_settings()
        state = make_state(settings)
        nonce, _ = state.rsplit(".", 1)
        assert not verify_state(f"{nonce}x.invalid", settings)

    def test_state_rejects_foreign_pepper(self) -> None:
        settings = _sso_settings(api_key_pepper="pepper-pepper-pepper-a")
        other = _sso_settings(api_key_pepper="pepper-pepper-pepper-b")
        state = make_state(settings)
        assert not verify_state(state, other)

    def test_state_rejects_malformed(self) -> None:
        settings = _sso_settings()
        assert not verify_state("no-dot", settings)
        assert not verify_state("", settings)

    def test_authorization_url_contains_expected_params(self) -> None:
        settings = _sso_settings()
        url = authorization_url(settings, "state-abc")
        assert url.startswith("https://idp.example.test/authorize?")
        assert "response_type=code" in url
        assert "client_id=client-123" in url
        assert "state=state-abc" in url
        assert "redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fauth%2Fsso%2Fkeycloak%2Fcallback" in url

    def test_callback_url(self) -> None:
        settings = _sso_settings()
        assert callback_url(settings) == (
            "http://localhost:8000/auth/sso/keycloak/callback"
        )

    def test_authorization_url_raises_when_disabled(self) -> None:
        settings = _sso_settings(sso_enabled=False)
        with pytest.raises(SsoError):
            authorization_url(settings, "state-abc")


class TestIdentity:
    def test_from_userinfo_extracts_claims(self) -> None:
        settings = _sso_settings()
        identity = SsoIdentity.from_userinfo(
            {
                "sub": "sub-1",
                "email": "  Ada@Example.com ",
                "given_name": "Ada",
                "family_name": "Owner",
            },
            settings,
        )
        assert identity.subject == "sub-1"
        assert identity.email == "ada@example.com"
        assert identity.full_name == "Ada Owner"

    def test_from_userinfo_requires_subject(self) -> None:
        settings = _sso_settings()
        with pytest.raises(SsoError):
            SsoIdentity.from_userinfo({"email": "a@b.com"}, settings)

    def test_from_userinfo_requires_email(self) -> None:
        settings = _sso_settings()
        with pytest.raises(SsoError):
            SsoIdentity.from_userinfo({"sub": "sub-1"}, settings)

    def test_from_userinfo_rejects_issuer_mismatch(self) -> None:
        settings = _sso_settings()
        with pytest.raises(SsoError):
            SsoIdentity.from_userinfo(
                {"sub": "sub-1", "email": "a@b.com", "iss": "https://evil.example"},
                settings,
            )


@pytest.mark.asyncio
class TestTokenExchange:
    def _fake_http_client(self, method: str, response_body: dict, error: bool = False):
        fake = AsyncMock()
        if error:

            def _raise(*args, **kwargs):
                raise RuntimeError("boom")

            resp = MagicMock(raise_for_status=_raise, json=lambda: response_body)
        else:
            resp = MagicMock(
                raise_for_status=lambda: None, json=lambda: response_body
            )
        method_mock = AsyncMock(return_value=resp)
        setattr(fake, method, method_mock)
        fake.__aenter__ = AsyncMock(return_value=fake)
        fake.__aexit__ = AsyncMock(return_value=False)
        return fake

    async def test_exchange_code_success(self) -> None:
        settings = _sso_settings()
        fake = self._fake_http_client(
            "post", {"access_token": "at-1", "token_type": "Bearer"}
        )
        with patch("app.auth.sso.httpx.AsyncClient", return_value=fake):
            tokens = await exchange_code(settings, "code-1")
        assert tokens["access_token"] == "at-1"
        fake.post.assert_awaited_once()

    async def test_exchange_code_raises_on_http_error(self) -> None:
        settings = _sso_settings()
        fake = self._fake_http_client("post", {}, error=True)
        with (
            patch("app.auth.sso.httpx.AsyncClient", return_value=fake),
            pytest.raises(SsoError),
        ):
            await exchange_code(settings, "code-1")

    async def test_fetch_userinfo_success(self) -> None:
        settings = _sso_settings()
        fake = self._fake_http_client("get", {"sub": "sub-1", "email": "a@b.com"})
        with patch("app.auth.sso.httpx.AsyncClient", return_value=fake):
            info = await fetch_userinfo(settings, "at-1")
        assert info["sub"] == "sub-1"
        fake.get.assert_awaited_once()

    async def test_fetch_userinfo_raises_on_http_error(self) -> None:
        settings = _sso_settings()
        fake = self._fake_http_client("get", {}, error=True)
        with (
            patch("app.auth.sso.httpx.AsyncClient", return_value=fake),
            pytest.raises(SsoError),
        ):
            await fetch_userinfo(settings, "at-1")


@pytest.mark.asyncio
class TestSsoApi:
    async def test_login_redirects_to_idp(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _sso_settings()
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
            response: Response = await client.get("/auth/sso/keycloak/login")

        assert response.status_code == 302
        assert response.headers["location"].startswith("https://idp.example.test/authorize?")
        assert "portcullis_sso_state" in response.headers.get("set-cookie", "")

    async def test_login_rejects_unknown_slug(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _sso_settings()
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get("/auth/sso/other/login")

        assert response.status_code == 404

    async def test_login_rejects_when_disabled(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _sso_settings(sso_enabled=False)
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get("/auth/sso/keycloak/login")

        assert response.status_code == 404

    async def test_callback_rejects_bad_state(self) -> None:
        app = _make_app()
        app.dependency_overrides[get_settings_dep] = lambda: _sso_settings()
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.get(
                "/auth/sso/keycloak/callback", params={"code": "c1", "state": "bad"}
            )

        assert response.status_code == 400

    async def test_callback_links_existing_user_by_email(self) -> None:
        app = _make_app()
        settings = _sso_settings()
        app.dependency_overrides[get_settings_dep] = lambda: settings
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        state = make_state(settings)

        user = MagicMock()
        user.id = ISSUER_ID
        user.email = "ada@example.com"
        user.is_active = True
        user.approval_status = UserApprovalStatus.APPROVED

        member_repo = MagicMock()
        member_repo.get_by_subject = AsyncMock(return_value=None)
        member_repo.create = AsyncMock(return_value=MagicMock())

        user_repo = MagicMock()
        user_repo.get_by_email = AsyncMock(return_value=user)

        with (
            patch("app.api.sso.OrgMemberRepository", return_value=member_repo),
            patch("app.api.sso.UserRepository", return_value=user_repo),
            patch(
                "app.api.sso.issue_key",
                return_value=MagicMock(plaintext="pk_userbound_xxx"),
            ),
            patch(
                "app.api.sso.exchange_code",
                new_callable=AsyncMock,
                return_value={"access_token": "at-1"},
            ),
            patch(
                "app.api.sso.fetch_userinfo",
                new_callable=AsyncMock,
                return_value={"sub": "sub-9", "email": "Ada@example.com"},
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
                response: Response = await client.get(
                    "/auth/sso/keycloak/callback",
                    params={"code": "c1", "state": state},
                    headers={"cookie": f"portcullis_sso_state={state}"},
                )

        assert response.status_code == 302
        assert response.headers["location"] == "/sso-callback?token=pk_userbound_xxx"
        member_repo.create.assert_awaited_once()

    async def test_callback_auto_provisions_new_user(self) -> None:
        app = _make_app()
        settings = _sso_settings()
        app.dependency_overrides[get_settings_dep] = lambda: settings
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
        app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

        state = make_state(settings)

        user = MagicMock()
        user.id = ISSUER_ID
        user.email = "new@example.com"

        member_repo = MagicMock()
        member_repo.get_by_subject = AsyncMock(return_value=None)
        member_repo.create = AsyncMock(return_value=MagicMock())

        user_repo = MagicMock()
        user_repo.get_by_email = AsyncMock(return_value=None)
        user_repo.create = AsyncMock(return_value=user)

        session = AsyncMock()
        session.commit = AsyncMock()

        app.dependency_overrides[get_session] = lambda: session

        with (
            patch("app.api.sso.OrgMemberRepository", return_value=member_repo),
            patch("app.api.sso.UserRepository", return_value=user_repo),
            patch(
                "app.api.sso.issue_key",
                return_value=MagicMock(plaintext="pk_userbound_yyy"),
            ),
            patch(
                "app.api.sso.exchange_code",
                new_callable=AsyncMock,
                return_value={"access_token": "at-1"},
            ),
            patch(
                "app.api.sso.fetch_userinfo",
                new_callable=AsyncMock,
                return_value={"sub": "sub-10", "email": "new@example.com"},
            ),
            patch("app.api.sso.create_default_roles", new_callable=AsyncMock),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
                response: Response = await client.get(
                    "/auth/sso/keycloak/callback",
                    params={"code": "c1", "state": state},
                    headers={"cookie": f"portcullis_sso_state={state}"},
                )

        assert response.status_code == 302
        assert response.headers["location"] == "/sso-callback?token=pk_userbound_yyy"
        user_repo.create.assert_awaited_once()
        member_repo.create.assert_awaited_once()
        session.commit.assert_awaited()