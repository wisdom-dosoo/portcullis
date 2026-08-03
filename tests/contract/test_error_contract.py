"""Contract tests: every gateway error must conform to JSON-RPC 2.0 shape rules.

Each error response must:
- Return Content-Type: application/json
- Have a body matching {"jsonrpc": "2.0", "id": ..., "error": {"code": N, "message": str}}
- Carry an X-Request-Id header
- NOT contain internal implementation words in the error message
- Return the correct HTTP status code
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.gateway.jsonrpc import (
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    UNAUTHORIZED,
)
from app.limits.redis_bucket import RateLimitResult

# Words that must never appear in safe error messages
INTERNAL_WORDS = ("traceback", "exception", "sqlalchemy", "redis", "argon", "stack")

# A RateLimitResult that always allows the request through
_ALLOWED_RESULT = RateLimitResult(
    allowed=True,
    limit=20,
    remaining=19,
    reset_after_seconds=60.0,
    retry_after_seconds=0.0,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_session() -> AsyncMock:
    """Return a mock AsyncSession."""
    session = AsyncMock(spec=AsyncSession)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


@pytest.fixture()
def mock_runtime(mock_session: AsyncMock) -> MagicMock:
    """Return a mock Runtime with mocked I/O handles."""
    factory = MagicMock(spec=async_sessionmaker)
    factory.return_value = mock_session

    runtime = MagicMock()
    runtime.session_factory = factory
    runtime.redis = MagicMock()  # plain MagicMock — we'll patch pre_auth at the module level
    runtime.http_client = AsyncMock()
    return runtime


@pytest.fixture()
def app(mock_runtime: MagicMock) -> Any:
    """Return a fully configured app instance with mocked runtime (no lifespan)."""
    from app.main import create_app

    application = create_app()
    application.state.runtime = mock_runtime  # type: ignore[attr-defined]
    # Also mock health monitor state so healthz works
    application.state.monitor = MagicMock()  # type: ignore[attr-defined]
    return application


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _assert_jsonrpc_error_shape(body: dict[str, Any], expected_code: int) -> None:
    """Assert the JSON-RPC error response has the canonical shape."""
    assert body.get("jsonrpc") == "2.0", f"missing/wrong jsonrpc field: {body}"
    assert "id" in body, f"missing 'id' field: {body}"
    assert "error" in body, f"missing 'error' field: {body}"
    error = body["error"]
    assert isinstance(error, dict), f"'error' must be a dict: {body}"
    assert error.get("code") == expected_code, (
        f"wrong error code: expected {expected_code}, got {error.get('code')}"
    )
    assert isinstance(error.get("message"), str), f"'message' must be a string: {body}"


def _assert_no_internal_words(text: str) -> None:
    """Assert the response body contains no internal implementation terms."""
    lower = text.lower()
    for word in INTERNAL_WORDS:
        assert word not in lower, f"Internal word '{word}' leaked into response: {text!r}"


# ---------------------------------------------------------------------------
# Parametrized contract test for parse/validation errors (pre-auth, no mock needed)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "description,body,content_type,expected_http,expected_code",
    [
        (
            "malformed JSON → parse error",
            b"not json",
            "application/json",
            400,
            PARSE_ERROR,
        ),
        (
            "valid JSON but missing jsonrpc field → invalid request",
            json.dumps({}).encode(),
            "application/json",
            400,
            INVALID_REQUEST,
        ),
        (
            "unsupported method → method not found",
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "unsupported/method"}).encode(),
            "application/json",
            404,
            METHOD_NOT_FOUND,
        ),
    ],
    ids=["parse-error", "invalid-request", "method-not-found"],
)
@pytest.mark.asyncio
async def test_parse_validation_error_contract(
    app: Any,
    description: str,
    body: bytes,
    content_type: str,
    expected_http: int,
    expected_code: int,
) -> None:
    """Parse/validation errors return correct HTTP status, code, shape, and no leakage."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/mcp/any-server",
            content=body,
            headers={"Content-Type": content_type},
        )

    assert response.status_code == expected_http, (
        f"{description}: expected HTTP {expected_http}, got {response.status_code}"
    )
    assert "application/json" in response.headers.get("content-type", ""), (
        f"{description}: expected application/json content-type"
    )
    assert "x-request-id" in response.headers, (
        f"{description}: missing X-Request-Id header"
    )

    resp_body = response.json()
    _assert_jsonrpc_error_shape(resp_body, expected_code)
    _assert_no_internal_words(response.text)


# ---------------------------------------------------------------------------
# Unauthorized (401) — requires passing parse phase, missing Authorization
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unauthorized_error_contract(app: Any, mock_runtime: MagicMock) -> None:
    """Valid JSON-RPC with tools/list but no Authorization → 401, code -32001."""
    valid_body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode()

    with patch(
        "app.gateway.router.check_pre_auth_limit",
        new=AsyncMock(return_value=_ALLOWED_RESULT),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/mcp/any-server",
                content=valid_body,
                headers={"Content-Type": "application/json"},
            )

    assert response.status_code == 401, (
        f"Expected HTTP 401, got {response.status_code}: {response.text}"
    )
    assert "application/json" in response.headers.get("content-type", "")
    assert "x-request-id" in response.headers

    resp_body = response.json()
    _assert_jsonrpc_error_shape(resp_body, UNAUTHORIZED)
    _assert_no_internal_words(response.text)


# ---------------------------------------------------------------------------
# Health check sanity test (not JSON-RPC, just verify it works)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_healthz_returns_status_field(app: Any, mock_runtime: MagicMock) -> None:
    """GET /healthz must return 200 with a 'status' field (not a JSON-RPC response)."""
    # Wire up a healthy DB session mock
    mock_session = mock_runtime.session_factory.return_value
    mock_session.execute = AsyncMock(return_value=MagicMock())
    mock_runtime.redis.ping = AsyncMock(return_value=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert "status" in body, f"'status' field missing from healthz response: {body}"
    # Verify it's NOT a JSON-RPC envelope
    assert "jsonrpc" not in body
    assert "x-request-id" in response.headers
