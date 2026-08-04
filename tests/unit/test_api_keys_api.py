"""Unit tests for the /v1/api-keys API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import IssuedKey, Subject
from app.main import create_app
from app.models.schemas import ApiKeyView

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)
KEY_ID = UUID("00000000-0000-0000-0000-000000000042")


def _make_subject(scopes: list[str] | None = None) -> Subject:
    from app.models.orm import SubjectType

    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(scopes or ["admin"]),
    )


def _make_api_key_view(key_id: UUID | None = None) -> ApiKeyView:
    return ApiKeyView(
        id=key_id or KEY_ID,
        name="test-key",
        key_prefix="abcdefgh",
        scopes=["admin"],
        created_at=NOW,
        last_used_at=None,
    )


def _make_orm_key(key_id: UUID | None = None) -> MagicMock:
    obj = MagicMock()
    obj.id = key_id or KEY_ID
    obj.name = "test-key"
    obj.key_prefix = "abcdefgh"
    obj.scopes = ["admin"]
    obj.created_at = NOW
    obj.last_used_at = None
    return obj


def _make_app_with_auth_overrides(
    admin_sub: Subject | None = None,
    auth_sub: Subject | None = None,
) -> FastAPI:
    """Create the app with auth dependencies overridden."""
    app = create_app()

    # Mock the runtime
    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime

    mock_monitor = AsyncMock()
    app.state.monitor = mock_monitor

    # Override auth deps
    _admin = admin_sub or _make_subject(["admin"])
    _auth = auth_sub or _make_subject(["admin"])

    app.dependency_overrides[admin_subject] = lambda: _admin
    app.dependency_overrides[authenticated_subject] = lambda: _auth

    return app


# ---------------------------------------------------------------------------
# POST /v1/api-keys — issue
# ---------------------------------------------------------------------------


class TestCreateApiKey:
    @pytest.mark.asyncio
    async def test_create_returns_201_with_plaintext(self) -> None:
        app = _make_app_with_auth_overrides()
        plaintext = "pk_abcdefgh_" + "a" * 43
        fake_orm = _make_orm_key()

        issued = IssuedKey(
            key_id=KEY_ID,
            plaintext=plaintext,
            prefix="abcdefgh",
            scopes=frozenset(["admin"]),
        )

        with (
            patch("app.api.api_keys.issue_key", new_callable=AsyncMock, return_value=issued),
            patch("app.api.api_keys.ApiKeyRepository") as MockRepo,
        ):
            mock_repo_instance = MockRepo.return_value
            mock_repo_instance.get_by_prefix = AsyncMock(return_value=fake_orm)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/v1/api-keys",
                    json={"name": "test-key", "scopes": ["admin"]},
                )

        assert resp.status_code == 201
        body = resp.json()
        assert "plaintext" in body
        assert body["plaintext"] == plaintext
        assert body["key"]["name"] == "test-key"

    @pytest.mark.asyncio
    async def test_create_without_admin_returns_403(self) -> None:
        """When admin_subject dep is not overridden with admin, expect 403."""
        app = create_app()

        mock_runtime = MagicMock()
        mock_session = AsyncMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            __import__("fastapi").HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/v1/api-keys",
                json={"name": "test-key"},
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/api-keys — list
# ---------------------------------------------------------------------------


class TestListApiKeys:
    @pytest.mark.asyncio
    async def test_list_returns_200_with_keys(self) -> None:
        app = _make_app_with_auth_overrides()
        fake_orm1 = _make_orm_key(uuid4())
        fake_orm2 = _make_orm_key(uuid4())

        with patch("app.api.api_keys.ApiKeyRepository") as MockRepo:
            mock_repo_instance = MockRepo.return_value
            mock_repo_instance.list_active = AsyncMock(return_value=[fake_orm1, fake_orm2])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/api-keys")

        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2

    @pytest.mark.asyncio
    async def test_list_empty_returns_empty_list(self) -> None:
        app = _make_app_with_auth_overrides()

        with patch("app.api.api_keys.ApiKeyRepository") as MockRepo:
            mock_repo_instance = MockRepo.return_value
            mock_repo_instance.list_active = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/api-keys")

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_requires_authentication(self) -> None:
        """No auth override — should return 401."""
        app = create_app()
        mock_runtime = MagicMock()
        mock_session = AsyncMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/v1/api-keys")

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /v1/api-keys/{key_id} — revoke
# ---------------------------------------------------------------------------


class TestRevokeApiKey:
    @pytest.mark.asyncio
    async def test_revoke_existing_returns_204(self) -> None:
        app = _make_app_with_auth_overrides()
        key_id = uuid4()

        with patch("app.api.api_keys.revoke_key", new_callable=AsyncMock, return_value=None):
            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/api-keys/{key_id}")

        assert resp.status_code == 204
        assert resp.content == b""

    @pytest.mark.asyncio
    async def test_revoke_missing_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        key_id = uuid4()

        with patch(
            "app.api.api_keys.revoke_key",
            new_callable=AsyncMock,
            side_effect=KeyError(key_id),
        ):
            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/api-keys/{key_id}")

        assert resp.status_code == 404
