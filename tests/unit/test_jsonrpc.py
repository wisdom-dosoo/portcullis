"""Unit tests for JSON-RPC 2.0 parsing and error helpers."""

from __future__ import annotations

import json

import pytest

from app.gateway.jsonrpc import (
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    make_error,
    parse_request,
)


class TestParseRequest:
    def test_valid_tools_call(self) -> None:
        body = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "my_tool", "arguments": {}},
            }
        ).encode()
        req = parse_request(body)
        assert req.jsonrpc == "2.0"
        assert req.method == "tools/call"
        assert req.id == 1
        assert req.params == {"name": "my_tool", "arguments": {}}

    def test_valid_tools_list(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "id": "abc", "method": "tools/list"}).encode()
        req = parse_request(body)
        assert req.method == "tools/list"
        assert req.id == "abc"
        assert req.params is None

    def test_notification_has_none_id(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}).encode()
        req = parse_request(body)
        assert req.id is None

    def test_initialize_method(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "id": 0, "method": "initialize"}).encode()
        req = parse_request(body)
        assert req.method == "initialize"

    def test_ping_method(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "id": 42, "method": "ping"}).encode()
        req = parse_request(body)
        assert req.method == "ping"

    def test_malformed_json_raises_parse_error(self) -> None:
        with pytest.raises(ValueError) as exc_info:
            parse_request(b"{not valid json")
        assert f"code={PARSE_ERROR}" in str(exc_info.value)

    def test_missing_jsonrpc_field_raises_invalid_request(self) -> None:
        body = json.dumps({"id": 1, "method": "tools/list"}).encode()
        with pytest.raises(ValueError) as exc_info:
            parse_request(body)
        assert f"code={INVALID_REQUEST}" in str(exc_info.value)

    def test_wrong_jsonrpc_version_raises_invalid_request(self) -> None:
        body = json.dumps({"jsonrpc": "1.0", "id": 1, "method": "tools/list"}).encode()
        with pytest.raises(ValueError) as exc_info:
            parse_request(body)
        assert f"code={INVALID_REQUEST}" in str(exc_info.value)

    def test_missing_method_raises_invalid_request(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "id": 1}).encode()
        with pytest.raises(ValueError) as exc_info:
            parse_request(body)
        assert f"code={INVALID_REQUEST}" in str(exc_info.value)

    def test_unknown_method_raises_method_not_found(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "some/unknown"}).encode()
        with pytest.raises(ValueError) as exc_info:
            parse_request(body)
        assert f"code={METHOD_NOT_FOUND}" in str(exc_info.value)

    def test_non_object_body_raises_invalid_request(self) -> None:
        body = json.dumps([1, 2, 3]).encode()
        with pytest.raises(ValueError) as exc_info:
            parse_request(body)
        assert f"code={INVALID_REQUEST}" in str(exc_info.value)

    def test_null_id_is_notification(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "id": None, "method": "ping"}).encode()
        req = parse_request(body)
        assert req.id is None


class TestMakeError:
    def test_structure_with_int_id(self) -> None:
        err = make_error(1, -32600, "Invalid Request")
        assert err["jsonrpc"] == "2.0"
        assert err["id"] == 1
        assert err["error"]["code"] == -32600
        assert err["error"]["message"] == "Invalid Request"

    def test_structure_with_none_id(self) -> None:
        err = make_error(None, -32700, "Parse error")
        assert err["id"] is None
        assert err["error"]["code"] == -32700

    def test_structure_with_string_id(self) -> None:
        err = make_error("req-123", -32001, "Unauthorized")
        assert err["id"] == "req-123"
        assert err["error"]["code"] == -32001
        assert err["error"]["message"] == "Unauthorized"

    def test_error_is_serializable(self) -> None:
        err = make_error(42, -32603, "Internal error")
        serialized = json.dumps(err)
        parsed = json.loads(serialized)
        assert parsed["id"] == 42
