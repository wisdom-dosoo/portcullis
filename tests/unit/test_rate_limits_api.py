"""Unit tests for the /v1/rate-limit-policies API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport

from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import RateLimitAlgorithm

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)


def _make_admin_subject() -> Subject:
    from app.models.orm import SubjectType

    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_non_admin_subject() -> Subject:
    from app.models.orm import SubjectType

    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset([]),
    )


def _make_app_with_auth_overrides(
    admin_sub: Subject | None = None,
    auth_sub: Subject | None = None,
) -> FastAPI:
    """Create the app with auth dependencies overridden."""
    app = create_app()

    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()

    _admin = admin_sub or _make_admin_subject()
    _auth = auth_sub or _make_admin_subject()

    app.dependency_overrides[admin_subject] = lambda: _admin
    app.dependency_overrides[authenticated_subject] = lambda: _auth

    return app


def _make_fake_policy(
    policy_id: UUID | None = None,
    subject_id: UUID | None = None,
    algorithm: RateLimitAlgorithm = RateLimitAlgorithm.SLIDING_WINDOW,
    request_limit: int = 100,
    window_seconds: int = 60,
    burst_capacity: int | None = None,
    priority: int = 0,
) -> MagicMock:
    obj = MagicMock()
    obj.id = policy_id or uuid4()
    obj.tenant_id = DEFAULT_TENANT_ID
    obj.subject_id = subject_id
    obj.server_pattern = None
    obj.tool_pattern = None
    obj.algorithm = algorithm
    obj.request_limit = request_limit
    obj.window_seconds = window_seconds
    obj.burst_capacity = burst_capacity
    obj.priority = priority
    obj.created_at = NOW
    obj.updated_at = NOW
    return obj


# ---------------------------------------------------------------------------
# POST /v1/rate-limit-policies — create policy
# ---------------------------------------------------------------------------


class TestCreatePolicy:
    @pytest.mark.asyncio
    async def test_create_sliding_window_returns_201(self) -> None:
        app = _make_app_with_auth_overrides()
        policy_id = uuid4()
        fake_policy = _make_fake_policy(policy_id=policy_id)

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.create = AsyncMock(return_value=fake_policy)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/v1/rate-limit-policies",
                    json={
                        "algorithm": "sliding_window",
                        "request_limit": 100,
                        "window_seconds": 60,
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["algorithm"] == "sliding_window"
        assert body["request_limit"] == 100

    @pytest.mark.asyncio
    async def test_create_token_bucket_returns_201(self) -> None:
        app = _make_app_with_auth_overrides()
        fake_policy = _make_fake_policy(
            algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
            request_limit=50,
            burst_capacity=75,
        )

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.create = AsyncMock(return_value=fake_policy)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/v1/rate-limit-policies",
                    json={
                        "algorithm": "token_bucket",
                        "request_limit": 50,
                        "window_seconds": 60,
                        "burst_capacity": 75,
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["burst_capacity"] == 75

    @pytest.mark.asyncio
    async def test_create_token_bucket_without_burst_returns_422(self) -> None:
        app = _make_app_with_auth_overrides()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/v1/rate-limit-policies",
                json={
                    "algorithm": "token_bucket",
                    "request_limit": 50,
                    "window_seconds": 60,
                    # missing burst_capacity
                },
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_policy_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/v1/rate-limit-policies",
                json={
                    "algorithm": "sliding_window",
                    "request_limit": 100,
                    "window_seconds": 60,
                },
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/rate-limit-policies — list policies
# ---------------------------------------------------------------------------


class TestListPolicies:
    @pytest.mark.asyncio
    async def test_list_returns_200(self) -> None:
        app = _make_app_with_auth_overrides()
        policies = [_make_fake_policy(request_limit=100), _make_fake_policy(request_limit=50)]

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=policies)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/rate-limit-policies")

        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2

    @pytest.mark.asyncio
    async def test_list_empty_returns_empty_list(self) -> None:
        app = _make_app_with_auth_overrides()

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/rate-limit-policies")

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_requires_authentication(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/v1/rate-limit-policies")

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /v1/rate-limit-policies/{policy_id} — update policy
# ---------------------------------------------------------------------------


class TestUpdatePolicy:
    @pytest.mark.asyncio
    async def test_update_returns_200(self) -> None:
        app = _make_app_with_auth_overrides()
        policy_id = uuid4()
        fake_policy = _make_fake_policy(policy_id=policy_id, request_limit=200)

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get = AsyncMock(return_value=fake_policy)
            instance.update = AsyncMock(return_value=fake_policy)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.patch(
                    f"/v1/rate-limit-policies/{policy_id}",
                    json={"request_limit": 200},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["request_limit"] == 200

    @pytest.mark.asyncio
    async def test_update_not_found_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        policy_id = uuid4()

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.patch(
                    f"/v1/rate-limit-policies/{policy_id}",
                    json={"request_limit": 200},
                )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/v1/rate-limit-policies/{uuid4()}",
                json={"request_limit": 200},
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /v1/rate-limit-policies/{policy_id} — delete policy
# ---------------------------------------------------------------------------


class TestDeletePolicy:
    @pytest.mark.asyncio
    async def test_delete_returns_204(self) -> None:
        app = _make_app_with_auth_overrides()
        policy_id = uuid4()
        fake_policy = _make_fake_policy(policy_id=policy_id)

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get = AsyncMock(return_value=fake_policy)
            instance.delete = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/rate-limit-policies/{policy_id}")

        assert resp.status_code == 204
        assert resp.content == b""

    @pytest.mark.asyncio
    async def test_delete_not_found_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        policy_id = uuid4()

        with patch("app.api.rate_limits.RateLimitRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/rate-limit-policies/{policy_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(f"/v1/rate-limit-policies/{uuid4()}")

        assert resp.status_code == 403
