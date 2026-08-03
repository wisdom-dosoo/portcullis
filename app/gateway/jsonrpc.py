"""JSON-RPC 2.0 types, parsing, and error helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

SUPPORTED_METHODS: frozenset[str] = frozenset(
    {
        "initialize",
        "notifications/initialized",
        "ping",
        "tools/list",
        "tools/call",
    }
)

# ---------------------------------------------------------------------------
# Error codes
# ---------------------------------------------------------------------------

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
UNAUTHORIZED = -32001
FORBIDDEN = -32002
RATE_LIMITED = -32003
UPSTREAM_UNAVAILABLE = -32004
INTERNAL_ERROR = -32603


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class JsonRpcRequest:
    """Validated JSON-RPC 2.0 request."""

    jsonrpc: str  # must be "2.0"
    method: str
    id: int | str | None  # None for notifications
    params: dict[str, Any] | None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_request(body: bytes) -> JsonRpcRequest:
    """Parse and validate a JSON-RPC 2.0 request body.

    Raises:
        ValueError: with a code hint embedded in the message for one of:
            - parse error (-32700): body is not valid JSON
            - invalid request (-32600): missing jsonrpc/method fields or wrong version
            - method not found (-32601): method is not in SUPPORTED_METHODS
    """
    try:
        data: Any = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError(f"code={PARSE_ERROR} Parse error: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"code={INVALID_REQUEST} Request must be a JSON object")  # noqa: TRY004

    jsonrpc = data.get("jsonrpc")
    if jsonrpc != "2.0":
        raise ValueError(
            f"code={INVALID_REQUEST} Invalid or missing 'jsonrpc' field; must be '2.0'"
        )

    method = data.get("method")
    if not isinstance(method, str) or not method:
        raise ValueError(f"code={INVALID_REQUEST} Invalid or missing 'method' field")

    if method not in SUPPORTED_METHODS:
        raise ValueError(
            f"code={METHOD_NOT_FOUND} Method '{method}' is not supported"
        )

    rpc_id: int | str | None = data.get("id", None)
    if rpc_id is not None and not isinstance(rpc_id, (int, str)):
        raise ValueError(f"code={INVALID_REQUEST} 'id' must be a string, integer, or null")

    params: dict[str, Any] | None = data.get("params")
    if params is not None and not isinstance(params, dict):
        raise ValueError(f"code={INVALID_REQUEST} 'params' must be an object or null")

    return JsonRpcRequest(
        jsonrpc=jsonrpc,
        method=method,
        id=rpc_id,
        params=params,
    )


def make_error(
    id: int | str | None,
    code: int,
    message: str,
) -> dict[str, Any]:
    """Build a JSON-RPC 2.0 error response dict."""
    return {
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    }
