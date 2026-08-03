"""Authenticated MCP proxy flow test boundary."""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="requires Docker")
def test_proxy_tools_list_filters_by_rbac() -> None:
    """End-to-end: authenticated subject sees only permitted tools."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_tools_call_allowed_by_rbac() -> None:
    """End-to-end: tools/call forwards when RBAC allows."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_tools_call_denied_by_rbac() -> None:
    """End-to-end: tools/call returns 403 when RBAC denies."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_malformed_json_returns_400() -> None:
    """End-to-end: malformed JSON body returns 400 with parse error."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_unsupported_method_returns_400() -> None:
    """End-to-end: unsupported method returns 400 with method-not-found."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_unauthenticated_returns_401() -> None:
    """End-to-end: missing API key returns 401."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_disabled_server_returns_503() -> None:
    """End-to-end: disabled server returns 503."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_rate_limit_returns_429() -> None:
    """End-to-end: rate-limited request returns 429 with Retry-After."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_notification_returns_202() -> None:
    """End-to-end: notification (id=null) returns 202 with no body."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_strips_client_credentials() -> None:
    """End-to-end: client Authorization not forwarded to upstream."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_injects_service_token() -> None:
    """End-to-end: service token injected into upstream Authorization header."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_sse_streaming() -> None:
    """End-to-end: SSE response is streamed back to client."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_no_redirects() -> None:
    """End-to-end: upstream redirect is not followed; returns upstream status."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_upstream_timeout_returns_502() -> None:
    """End-to-end: upstream timeout returns 502."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_rate_limit_headers_present() -> None:
    """End-to-end: RateLimit-Limit/Remaining/Reset headers present on all responses."""


@pytest.mark.skip(reason="requires Docker")
def test_proxy_pipeline_ordering() -> None:
    """End-to-end: pipeline steps execute in the required order."""
