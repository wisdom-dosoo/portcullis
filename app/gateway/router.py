"""MCP server selection and request routing boundary."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from redis.exceptions import RedisError

from app.auth.api_keys import verify_key
from app.auth.rbac import evaluate_permission
from app.auth.tool_filter import filter_tools_list
from app.config import Settings
from app.gateway.headers import build_upstream_headers, extract_service_token
from app.gateway.jsonrpc import (
    FORBIDDEN,
    INTERNAL_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    RATE_LIMITED,
    UNAUTHORIZED,
    UPSTREAM_UNAVAILABLE,
    JsonRpcRequest,
    make_error,
    parse_request,
)
from app.gateway.proxy import McpProxy, UpstreamError
from app.limits.policies import _parse_default, resolve_policy
from app.limits.pre_auth import check_pre_auth_limit
from app.limits.redis_bucket import RateLimiter
from app.models.orm import ServerAuthMode, ServerStatus
from app.repositories.rate_limits import RateLimitRepository
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository
from app.runtime import Runtime

logger = structlog.get_logger(__name__)

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")

router = APIRouter(tags=["proxy"])


def _rate_limit_headers(result: Any) -> dict[str, str]:
    """Build rate-limit response headers from a RateLimitResult."""
    return {
        "RateLimit-Limit": str(result.limit),
        "RateLimit-Remaining": str(result.remaining),
        "RateLimit-Reset": str(int(result.reset_after_seconds)),
    }


def _json_error(
    request: Request,
    status_code: int,
    rpc_id: int | str | None,
    code: int,
    message: str,
    extra_headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Return a JSON-RPC error response with request-id header."""
    request_id = getattr(request.state, "request_id", None)
    headers: dict[str, str] = {}
    if request_id:
        headers["X-Request-Id"] = request_id
    if extra_headers:
        headers.update(extra_headers)
    return JSONResponse(
        content=make_error(rpc_id, code, message),
        status_code=status_code,
        headers=headers or None,
    )


@router.post("/mcp/{server_slug}")
async def mcp_proxy(
    server_slug: str,
    request: Request,
) -> Response:
    """Full MCP proxy pipeline: auth → registry → RBAC → rate-limit → forward."""
    runtime: Runtime = request.app.state.runtime
    from app.config import get_settings

    settings: Settings = get_settings()

    request_id = getattr(request.state, "request_id", None)

    # -------------------------------------------------------------------------
    # Step 1: Parse and validate JSON-RPC body
    # -------------------------------------------------------------------------
    body = await request.body()
    try:
        rpc_request: JsonRpcRequest = parse_request(body)
    except ValueError as exc:
        msg = str(exc)
        # Detect error code from embedded hint
        if f"code={PARSE_ERROR}" in msg:
            code = PARSE_ERROR
            http_status = 400
        elif f"code={METHOD_NOT_FOUND}" in msg:
            code = METHOD_NOT_FOUND
            http_status = 404
        else:
            code = INVALID_REQUEST
            http_status = 400
        return _json_error(
            request,
            http_status,
            None,
            code,
            msg.split(" ", 1)[-1] if " " in msg else msg,
        )

    rpc_id = rpc_request.id

    # -------------------------------------------------------------------------
    # Step 2: Pre-auth rate limit (by client IP), then authenticate
    # -------------------------------------------------------------------------
    client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

    try:
        pre_auth_limit, pre_auth_window = _parse_default(settings.auth_rate_limit_default)
        pre_auth_result = await check_pre_auth_limit(
            client_ip,
            runtime.redis,
            pre_auth_limit,
            pre_auth_window,
        )
    except RedisError as exc:
        logger.error("proxy.pre_auth_redis_error", error=str(exc))
        return _json_error(request, 503, rpc_id, INTERNAL_ERROR, "Rate limit backend unavailable")

    if not pre_auth_result.allowed:
        headers = _rate_limit_headers(pre_auth_result)
        headers["Retry-After"] = str(int(pre_auth_result.retry_after_seconds))
        return _json_error(
            request, 429, rpc_id, RATE_LIMITED, "Pre-auth rate limit exceeded", headers
        )

    authorization = request.headers.get("authorization", "")
    raw_key = authorization.removeprefix("Bearer ").strip()
    if not raw_key:
        return _json_error(request, 401, rpc_id, UNAUTHORIZED, "Invalid or missing API key")

    async with runtime.session_factory() as session:
        try:
            subject = await verify_key(
                raw=raw_key,
                pepper=settings.api_key_pepper,
                session=session,
            )
        except ValueError:
            return _json_error(request, 401, rpc_id, UNAUTHORIZED, "Invalid or missing API key")

        # -------------------------------------------------------------------------
        # Step 3: Resolve registry entry (must be ACTIVE)
        # -------------------------------------------------------------------------
        repo = ServerRepository(session)
        server = await repo.get_by_slug(DEFAULT_TENANT_ID, server_slug)

        if server is None:
            return _json_error(
                request, 503, rpc_id, UPSTREAM_UNAVAILABLE, f"Server '{server_slug}' not found"
            )

        if server.status == ServerStatus.DISABLED:
            return _json_error(
                request, 503, rpc_id, UPSTREAM_UNAVAILABLE, f"Server '{server_slug}' is disabled"
            )

        if server.status == ServerStatus.UNHEALTHY:
            return _json_error(
                request, 503, rpc_id, UPSTREAM_UNAVAILABLE, f"Server '{server_slug}' is unhealthy"
            )

        # -------------------------------------------------------------------------
        # Step 4: Derive MCP method and tool name
        # -------------------------------------------------------------------------
        method = rpc_request.method
        tool_name: str | None = None
        if method == "tools/call" and rpc_request.params:
            tool_name = rpc_request.params.get("name")

        # -------------------------------------------------------------------------
        # Step 5: RBAC check for tools/call
        # -------------------------------------------------------------------------
        if method == "tools/call":
            if tool_name is None:
                return _json_error(
                    request, 400, rpc_id, INVALID_REQUEST, "tools/call requires params.name"
                )

            rbac_repo = RbacRepository(session)
            permissions = await rbac_repo.get_permissions_for_subject(subject.key_id)
            decision = evaluate_permission(subject.key_id, server_slug, tool_name, permissions)
            if not decision.allowed:
                return _json_error(
                    request, 403, rpc_id, FORBIDDEN, f"Tool '{tool_name}' is not permitted"
                )

        # -------------------------------------------------------------------------
        # Step 6: Resolve rate-limit policy and check
        # -------------------------------------------------------------------------
        rl_repo = RateLimitRepository(session)
        policies = await rl_repo.list(DEFAULT_TENANT_ID)
        policy = resolve_policy(
            subject.key_id, server_slug, tool_name or method, policies, settings.rate_limit_default
        )

        try:
            limiter = RateLimiter(runtime.redis)
            rl_result = await limiter.check(
                tenant_id=DEFAULT_TENANT_ID,
                subject_id=subject.key_id,
                server_slug=server_slug,
                tool_or_method=tool_name or method,
                policy=policy,
            )
        except RedisError as exc:
            logger.error("proxy.rate_limit_redis_error", error=str(exc))
            return _json_error(
                request, 503, rpc_id, INTERNAL_ERROR, "Rate limit backend unavailable"
            )

        rl_headers = _rate_limit_headers(rl_result)

        if not rl_result.allowed:
            retry_headers = dict(rl_headers)
            retry_headers["Retry-After"] = str(int(rl_result.retry_after_seconds))
            return _json_error(
                request, 429, rpc_id, RATE_LIMITED, "Rate limit exceeded", retry_headers
            )

        # -------------------------------------------------------------------------
        # Step 7: Build upstream headers
        # -------------------------------------------------------------------------
        service_token: str | None = None
        if server.auth_mode == ServerAuthMode.SERVICE_TOKEN:
            service_token = extract_service_token(server.service_token_env_var)

        upstream_headers = build_upstream_headers(dict(request.headers), service_token)

        # -------------------------------------------------------------------------
        # Step 8: Forward to upstream
        # -------------------------------------------------------------------------
        proxy = McpProxy(runtime.http_client, settings)
        try:
            upstream_response = await proxy.forward(
                upstream_url=server.upstream_url,
                path="",
                method=request.method,
                headers=upstream_headers,
                body=body,
            )
        except UpstreamError as exc:
            logger.error("proxy.upstream_error", server_slug=server_slug, error=str(exc))
            return _json_error(
                request, 502, rpc_id, UPSTREAM_UNAVAILABLE, "Upstream server error", rl_headers
            )

        # -------------------------------------------------------------------------
        # Step 9 / 10: Handle response
        # -------------------------------------------------------------------------

        # Notifications: return 202 with no body
        if rpc_id is None:
            response_headers = dict(rl_headers)
            if request_id:
                response_headers["X-Request-Id"] = request_id
            return Response(status_code=202, headers=response_headers)

        # Build base response headers
        response_headers = dict(rl_headers)
        if request_id:
            response_headers["X-Request-Id"] = request_id

        content_type = upstream_response.headers.get("content-type", "")

        # tools/list: buffer, parse, filter, return
        if method == "tools/list":
            raw_body = upstream_response.content
            try:
                response_body: dict[str, Any] = json.loads(raw_body)
            except (json.JSONDecodeError, ValueError):
                # Cannot parse — pass through as-is
                return Response(
                    content=raw_body,
                    status_code=upstream_response.status_code,
                    headers=response_headers,
                    media_type=content_type or "application/json",
                )

            filtered = await filter_tools_list(response_body, subject, server_slug, session)
            return JSONResponse(
                content=filtered,
                status_code=upstream_response.status_code,
                headers=response_headers,
            )

        # SSE streaming
        if content_type.startswith("text/event-stream"):

            async def _stream() -> Any:
                async for chunk in upstream_response.aiter_bytes():
                    yield chunk

            return StreamingResponse(
                _stream(),
                status_code=upstream_response.status_code,
                headers=response_headers,
                media_type=content_type,
            )

        # Default: buffer and return
        return Response(
            content=upstream_response.content,
            status_code=upstream_response.status_code,
            headers=response_headers,
            media_type=content_type or "application/json",
        )
