"""Tests for the /healthz readiness endpoint."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@pytest.fixture()
def mock_session() -> AsyncMock:
    """Return a mock AsyncSession whose execute succeeds by default."""
    session = AsyncMock(spec=AsyncSession)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


@pytest.fixture()
def mock_runtime(mock_session: AsyncMock) -> MagicMock:
    """Return a mock Runtime with healthy DB and Redis by default."""
    factory = MagicMock(spec=async_sessionmaker)
    factory.return_value = mock_session

    runtime = MagicMock()
    runtime.session_factory = factory
    runtime.redis = AsyncMock()
    runtime.redis.ping = AsyncMock(return_value=True)
    return runtime


@pytest.fixture()
def app(mock_runtime: MagicMock) -> Any:
    """Return a create_app() instance with mocked runtime injected."""
    from app.main import create_app

    application = create_app()
    application.state.runtime = mock_runtime  # type: ignore[attr-defined]
    return application


@pytest.mark.asyncio
async def test_healthz_returns_200_when_all_healthy(app: Any, mock_runtime: MagicMock) -> None:
    """GET /healthz → 200 with status=ok when DB and Redis are both healthy."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["redis"] == "ok"


@pytest.mark.asyncio
async def test_healthz_returns_503_on_database_failure(
    app: Any, mock_runtime: MagicMock, mock_session: AsyncMock
) -> None:
    """GET /healthz → 503 with database=error when DB raises an exception."""
    mock_session.execute = AsyncMock(side_effect=Exception("connection refused"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "error"


@pytest.mark.asyncio
async def test_healthz_returns_503_on_redis_failure(
    app: Any, mock_runtime: MagicMock
) -> None:
    """GET /healthz → 503 with redis=error when Redis raises an exception."""
    mock_runtime.redis.ping = AsyncMock(side_effect=Exception("redis unreachable"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["redis"] == "error"


@pytest.mark.asyncio
async def test_healthz_response_has_request_id_header(app: Any) -> None:
    """Every /healthz response must carry an X-Request-Id header."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz")

    assert "x-request-id" in response.headers


@pytest.mark.asyncio
async def test_healthz_preserves_caller_request_id(app: Any) -> None:
    """The middleware must echo back an X-Request-Id supplied by the caller."""
    request_id = "my-tracing-id-1234"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz", headers={"X-Request-Id": request_id})

    assert response.headers["x-request-id"] == request_id


@pytest.mark.asyncio
async def test_healthz_body_never_leaks_exception_text(
    app: Any, mock_runtime: MagicMock, mock_session: AsyncMock
) -> None:
    """The response body must never include exception class names or tracebacks."""
    mock_session.execute = AsyncMock(side_effect=RuntimeError("OperationalError: secret dsn"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz")

    body_text = response.text
    assert "RuntimeError" not in body_text
    assert "OperationalError" not in body_text
    assert "Traceback" not in body_text
    assert "secret dsn" not in body_text
