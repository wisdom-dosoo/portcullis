"""MCP upstream header sanitization boundary."""

from __future__ import annotations

import os
from collections.abc import Mapping

# Headers that must never pass upstream — credentials and hop-by-hop headers.
STRIP_FROM_CLIENT: frozenset[str] = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "host",
    }
)


def build_upstream_headers(
    client_headers: Mapping[str, str],
    service_token: str | None,
) -> dict[str, str]:
    """Strip forbidden headers from the client request, then inject upstream auth.

    Args:
        client_headers: Raw headers from the inbound client request.
        service_token:  Optional bearer token for the upstream service.

    Returns:
        Sanitized header dict suitable for forwarding upstream.
    """
    result: dict[str, str] = {
        k: v for k, v in client_headers.items() if k.lower() not in STRIP_FROM_CLIENT
    }

    if service_token is not None:
        result["Authorization"] = f"Bearer {service_token}"

    return result


def extract_service_token(env_var_name: str | None) -> str | None:
    """Read a service token from an allow-listed environment variable.

    P0: only ``PORTCULLIS_UPSTREAM_TOKEN_[A-Z0-9_]{1,64}`` names are honored.
    Anything else returns None so a stale/malicious DB value cannot exfiltrate
    arbitrary process env (DATABASE_URL, API_KEY_PEPPER, SSO secrets).
    """
    if not env_var_name:
        return None
    import re as _re

    if _re.fullmatch(r"PORTCULLIS_UPSTREAM_TOKEN_[A-Z0-9_]{1,64}", env_var_name) is None:
        return None
    value = os.environ.get(env_var_name, "")
    return value if value else None
