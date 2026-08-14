"""Unit tests for MCP upstream header sanitization."""

from __future__ import annotations

from app.gateway.headers import build_upstream_headers, extract_service_token


class TestBuildUpstreamHeaders:
    def test_strips_authorization(self) -> None:
        headers = {"Authorization": "Bearer sk-secret", "Content-Type": "application/json"}
        result = build_upstream_headers(headers, service_token=None)
        assert "Authorization" not in result
        assert "authorization" not in result

    def test_strips_cookie(self) -> None:
        headers = {"cookie": "session=abc", "Content-Type": "application/json"}
        result = build_upstream_headers(headers, service_token=None)
        assert "cookie" not in result
        assert "Cookie" not in result

    def test_strips_host(self) -> None:
        headers = {"host": "example.com", "accept": "application/json"}
        result = build_upstream_headers(headers, service_token=None)
        assert "host" not in result

    def test_strips_hop_by_hop_headers(self) -> None:
        headers = {
            "connection": "keep-alive",
            "keep-alive": "timeout=5",
            "transfer-encoding": "chunked",
            "te": "trailers",
            "upgrade": "websocket",
        }
        result = build_upstream_headers(headers, service_token=None)
        for h in headers:
            assert h not in result

    def test_preserves_content_type(self) -> None:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        result = build_upstream_headers(headers, service_token=None)
        assert result.get("Content-Type") == "application/json"

    def test_preserves_custom_headers(self) -> None:
        headers = {"X-Custom-Header": "my-value", "Content-Type": "application/json"}
        result = build_upstream_headers(headers, service_token=None)
        assert result.get("X-Custom-Header") == "my-value"

    def test_injects_service_token_when_provided(self) -> None:
        headers = {"Content-Type": "application/json"}
        result = build_upstream_headers(headers, service_token="my-upstream-token")
        assert result.get("Authorization") == "Bearer my-upstream-token"

    def test_no_service_token_when_none(self) -> None:
        headers = {"Content-Type": "application/json"}
        result = build_upstream_headers(headers, service_token=None)
        assert "Authorization" not in result

    def test_service_token_replaces_stripped_auth(self) -> None:
        """Client auth is stripped even when service token is injected."""
        headers = {
            "Authorization": "Bearer client-secret",
            "Content-Type": "application/json",
        }
        result = build_upstream_headers(headers, service_token="upstream-token")
        assert result.get("Authorization") == "Bearer upstream-token"

    def test_empty_headers(self) -> None:
        result = build_upstream_headers({}, service_token=None)
        assert result == {}

    def test_set_cookie_stripped(self) -> None:
        headers = {"set-cookie": "foo=bar; HttpOnly"}
        result = build_upstream_headers(headers, service_token=None)
        assert "set-cookie" not in result


class TestExtractServiceToken:
    def test_returns_none_when_env_var_name_is_none(self) -> None:
        assert extract_service_token(None) is None

    def test_returns_none_when_env_var_not_set(self) -> None:
        # Use a name that almost certainly isn't set
        assert extract_service_token("PORTCULLIS_TEST_TOKEN_NONEXISTENT_XYZ") is None

    def test_returns_token_when_env_var_set(self, monkeypatch: object) -> None:
        import pytest

        with pytest.MonkeyPatch().context() as mp:
            mp.setenv("PORTCULLIS_TEST_TOKEN_ABC", "my-secret-token")
            result = extract_service_token("PORTCULLIS_TEST_TOKEN_ABC")
            assert result == "my-secret-token"

    def test_returns_none_when_env_var_is_empty_string(self, monkeypatch: object) -> None:
        import pytest

        with pytest.MonkeyPatch().context() as mp:
            mp.setenv("PORTCULLIS_TEST_EMPTY_TOKEN", "")
            result = extract_service_token("PORTCULLIS_TEST_EMPTY_TOKEN")
            assert result is None
