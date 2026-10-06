"""Agent discovery endpoints (no auth) — MCP client bootstrap.

Exposes RFC9728-style metadata + a gateway card so AI agents, IDEs
(Claude Desktop, Cursor, Cline, Windsurf) and LangGraph runtimes can
auto-configure against Portcullis without reading the README:

- GET /.well-known/mcp.json — gateway card: proxy route shape,
  auth modes, JSON-RPC error codes, client config hint.
- GET /.well-known/oauth-protected-resource — RFC9728 protected-resource
  metadata pointing at the JWKS issuer when OAuth mode is configured.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import __version__

router = APIRouter(tags=["discovery"])

ERROR_CODES = {
    "-32700": "Parse error — malformed JSON body",
    "-32600": "Invalid Request — missing JSON-RPC fields",
    "-32601": "Method not found — upstream reports no such method/tool",
    "-32602": "Invalid params — schema validation failed",
    "-32603": "Internal error — unhandled gateway/upstream failure",
    "-32001": "Unauthorized — missing/invalid bearer token or API key",
    "-32002": "Forbidden — RBAC denies subject/server/tool",
    "-32003": "Rate limited — Retry-After header present",
    "-32004": "Upstream unavailable — health check failing / circuit open",
}


@router.get("/.well-known/mcp.json", include_in_schema=True)
async def mcp_card(request: Request) -> JSONResponse:
    """Return a machine-readable gateway card for agent auto-configuration."""
    base = str(request.base_url).rstrip("/")
    return JSONResponse(
        content={
            "name": "portcullis",
            "version": __version__,
            "description": "Multi-tenant MCP gateway: auth, per-tool RBAC, rate limits, audit.",
            "proxy": {
                "route": f"{base}/mcp/{{server_slug}}",
                "transports": ["streamable_http"],
                "methods": [
                    "tools/list",
                    "tools/call",
                    "resources/list",
                    "resources/read",
                    "prompts/list",
                    "prompts/get",
                ],
                "query": {
                    "dry_run": "?dry_run=1 returns the RBAC/rate-limit decision without forwarding upstream"
                },
                "headers": {
                    "Authorization": "Bearer <api-key-or-jwt> (required)",
                    "Mcp-Session-Id": "opaque session id, echoed from upstream (optional)",
                    "X-Request-Id": "client-supplied idempotency/trace id (optional)",
                },
            },
            "auth": {
                "modes": ["api_key", "oauth_jwt"],
                "oauth_protected_resource": f"{base}/.well-known/oauth-protected-resource",
            },
            "management_api": f"{base}/openapi.json",
            "error_codes": ERROR_CODES,
            "client_config_hint": {
                "mcpServers": {
                    "<server_slug>": {
                        "url": f"{base}/mcp/<server_slug>",
                        "transport": "streamable_http",
                        "headers": {"Authorization": "Bearer $PORTCULLIS_API_KEY"},
                    }
                },
                "cli": "portcullis mcp config --client claude --server <slug> --base-url "
                + base,
            },
        }
    )


@router.get("/.well-known/oauth-protected-resource", include_in_schema=True)
async def oauth_protected_resource(request: Request) -> JSONResponse:
    """Return RFC9728 protected-resource metadata for OAuth-capable MCP clients."""
    from app.config import get_settings

    settings = get_settings()
    base = str(request.base_url).rstrip("/")
    body: dict[str, object] = {
        "resource": base,
        "authorization_servers": [settings.jwt_issuer] if settings.jwt_issuer else [],
        "bearer_methods_supported": ["header"],
        "scopes_supported": ["admin", "auditor"],
    }
    # RFC9728: when no external AS is configured, clients fall back to API keys.
    if not settings.jwt_issuer:
        body["api_key"] = {
            "header": "Authorization: Bearer pk_live_...",
            "issue": "POST /v1/api-keys (admin scope, secret shown once)",
        }
    return JSONResponse(content=body)
