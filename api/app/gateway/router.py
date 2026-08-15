"""MCP server selection and request routing boundary."""

from __future__ import annotations

import json
import time
from typing import Any

import structlog
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from redis.exceptions import RedisError

from app.auth.authenticate import authenticate
from app.auth.rbac import evaluate_permission
from app.auth.tool_filter import filter_tools_list
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.gateway.headers import build_upstream_headers, extract_service_token
from app.gateway.jsonrpc import (
    FORBIDDEN,
    INTERNAL_ERROR,
    INVALID_PARAMS,
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
from app.gateway.session import SessionStore
from app.limits.policies import parse_default, resolve_policy
from app.limits.pre_auth import check_pre_auth_limit
from app.limits.redis_bucket import RateLimiter
from app.models.orm import AuditEventType, ServerAuthMode, ServerStatus
from app.observability.audit import record_event
from app.observability.metrics import AUTH_FAILURES, RATE_LIMIT_REJECTIONS, RBAC_DENIALS
from app.repositories.rate_limits import RateLimitRepository
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository
from app.runtime import Runtime

router = APIRouter(tags=["proxy"])

logger = structlog.get_logger(__name__)


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
    client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"
    start_time = time.perf_counter()

    # -------------------------------------------------------------------------
    # Step 1: Read and bound the request body, then validate JSON-RPC
    # -------------------------------------------------------------------------
    # Enforce a request-size limit BEFORE any parsing/authentication so a small
    # number of large bodies cannot exhaust worker memory prior to rate limiting.
    content_length = request.headers.get("content-length")
    if content_length is not None and content_length.isdigit():
        declared_bytes = int(content_length)
        if declared_bytes > settings.max_request_body_bytes:
            return _json_error(request, 413, None, INVALID_REQUEST, "Request body too large")

    body = await request.body()
    if len(body) > settings.max_request_body_bytes:
        return _json_error(request, 413, None, INVALID_REQUEST, "Request body too large")

    try:
        rpc_request: JsonRpcRequest = parse_request(body)
    except ValueError as exc:
        msg = str(exc)
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
    try:
        pre_auth_limit, pre_auth_window = parse_default(settings.auth_rate_limit_default)
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
        # Use a fixed label — the slug is unvalidated at this stage and could be
        # attacker-controlled, which would create unbounded Prometheus cardinality.
        RATE_LIMIT_REJECTIONS.labels(server_slug="_pre_auth", scope="pre_auth").inc()
        return _json_error(
            request, 429, rpc_id, RATE_LIMITED, "Pre-auth rate limit exceeded", headers
        )

    authorization = request.headers.get("authorization", "")
    raw_token = authorization.removeprefix("Bearer ").strip()
    if not raw_token:
        AUTH_FAILURES.labels(reason="missing_credentials").inc()
        return _json_error(request, 401, rpc_id, UNAUTHORIZED, "Invalid or missing credentials")

    async with runtime.session_factory() as session:
        try:
            subject = await authenticate(raw_token, settings, session)
        except ValueError:
            AUTH_FAILURES.labels(reason="invalid_credentials").inc()
            await record_event(
                runtime.session_factory,
                event_type=AuditEventType.AUTH_FAILURE,
                outcome="denied",
                server_slug=server_slug,
                client_ip=client_ip,
                request_id=request_id,
                detail={"rpc_id": str(rpc_id)},
            )
            return _json_error(request, 401, rpc_id, UNAUTHORIZED, "Invalid or missing credentials")

        try:
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
                    request,
                    503,
                    rpc_id,
                    UPSTREAM_UNAVAILABLE,
                    f"Server '{server_slug}' is disabled",
                )

            if server.status == ServerStatus.UNHEALTHY:
                return _json_error(
                    request,
                    503,
                    rpc_id,
                    UPSTREAM_UNAVAILABLE,
                    f"Server '{server_slug}' is unhealthy",
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
                        request, 422, rpc_id, INVALID_PARAMS, "tools/call requires params.name"
                    )

                rbac_repo = RbacRepository(session)
                permissions = await rbac_repo.get_permissions_for_subject(
                    subject.tenant_id,
                    subject.subject_type,
                    subject.subject_id,
                )
                decision = evaluate_permission(
                    subject.subject_id, server_slug, tool_name, permissions
                )
                if not decision.allowed:
                    RBAC_DENIALS.labels(server_slug=server_slug).inc()
                    await record_event(
                        runtime.session_factory,
                        event_type=AuditEventType.RBAC_DENY,
                        outcome="denied",
                        tenant_id=subject.tenant_id,
                        subject_id=subject.subject_id,
                        subject_type=subject.subject_type,
                        server_slug=server_slug,
                        tool_name=tool_name,
                        rpc_method=method,
                        client_ip=client_ip,
                        request_id=request_id,
                        detail={"rule_id": str(decision.rule_id), "reason": decision.reason},
                    )
                    return _json_error(
                        request, 403, rpc_id, FORBIDDEN, f"Tool '{tool_name}' is not permitted"
                    )

            # -------------------------------------------------------------------------
            # Step 6: Resolve rate-limit policy and check
            # -------------------------------------------------------------------------
            rl_repo = RateLimitRepository(session)
            policies = await rl_repo.list(DEFAULT_TENANT_ID)
            policy = resolve_policy(
                subject.subject_id,
                server_slug,
                tool_name or method,
                policies,
                settings.rate_limit_default,
            )

            try:
                limiter = RateLimiter(runtime.redis)
                rl_result = await limiter.check(
                    tenant_id=DEFAULT_TENANT_ID,
                    subject_id=subject.subject_id,
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
                RATE_LIMIT_REJECTIONS.labels(server_slug=server_slug, scope="per_subject").inc()
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

            # Preserve the client's session id across the hop.  ``build_upstream_headers``
            # copies allowed headers verbatim, so inbound Mcp-Session-Id already flows
            # upstream; the value is captured here for validation and re-issue below.
            inbound_session_id = request.headers.get("mcp-session-id")

            # -------------------------------------------------------------------------
            # Step 8: Forward to upstream (buffered unless the method implies SSE)
            # -------------------------------------------------------------------------
            should_stream = request.headers.get("accept") == "text/event-stream"
            proxy = McpProxy(runtime.http_client, settings)
            try:
                upstream_response = await proxy.forward(
                    upstream_url=server.upstream_url,
                    path="",
                    method=request.method,
                    headers=upstream_headers,
                    body=body,
                    stream=should_stream,
                )
            except UpstreamError as exc:
                logger.error("proxy.upstream_error", server_slug=server_slug, error=str(exc))
                return _json_error(
                    request,
                    502,
                    rpc_id,
                    UPSTREAM_UNAVAILABLE,
                    "Upstream server error",
                    rl_headers,
                )

            # Capture upstream session id once the response headers are known.
            upstream_session_id = upstream_response.headers.get("mcp-session-id")

            # -------------------------------------------------------------------------
            # Step 9 / 10: Handle response
            # -------------------------------------------------------------------------

            # Notifications: return 202 with no body.
            if rpc_id is None:
                response_headers = dict(rl_headers)
                if request_id:
                    response_headers["X-Request-Id"] = request_id
                if upstream_session_id and upstream_session_id != inbound_session_id:
                    response_headers["Mcp-Session-Id"] = upstream_session_id
                return Response(status_code=202, headers=response_headers)

            # Build base response headers
            response_headers = dict(rl_headers)
            if request_id:
                response_headers["X-Request-Id"] = request_id

            # Read the full body when the response is not being streamed.  For a
            # streamed (SSE) response, headers are already available and the body
            # is consumed chunk-by-chunk below without buffering.
            if not should_stream:
                await upstream_response.aread()

            # Persist the session mapping so multi-turn, stateful MCP sessions stay
            # pinned to (tenant, subject, server) under a sliding TTL.
            if upstream_session_id:
                session_store = SessionStore(runtime.redis)
                if inbound_session_id and inbound_session_id != upstream_session_id:
                    await session_store.delete(inbound_session_id)
                await session_store.record(
                    upstream_session_id,
                    tenant_id=subject.tenant_id,
                    subject_id=subject.subject_id,
                    server_slug=server_slug,
                )
                response_headers["Mcp-Session-Id"] = upstream_session_id

            content_type = upstream_response.headers.get("content-type", "")

            # SSE streaming — read content-type before consuming any body.
            if content_type.startswith("text/event-stream") or should_stream:

                async def _stream() -> Any:
                    try:
                        async for chunk in upstream_response.aiter_bytes():
                            yield chunk
                    finally:
                        await upstream_response.aclose()

                return StreamingResponse(
                    _stream(),
                    status_code=upstream_response.status_code,
                    headers=response_headers,
                    media_type=content_type or "text/event-stream",
                )

            # tools/list: buffer, parse, filter, return
            if method == "tools/list":
                raw_body = upstream_response.content
                try:
                    response_body: dict[str, Any] = json.loads(raw_body)
                except (json.JSONDecodeError, ValueError):
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

            # Default: buffer and return. Audit tool calls on success.
            if method == "tools/call" and upstream_response.status_code < 500:
                latency_ms = int((time.perf_counter() - start_time) * 1000)
                await record_event(
                    runtime.session_factory,
                    event_type=AuditEventType.TOOL_CALL,
                    outcome="allowed",
                    tenant_id=subject.tenant_id,
                    subject_id=subject.subject_id,
                    subject_type=subject.subject_type,
                    server_slug=server_slug,
                    tool_name=tool_name,
                    rpc_method=method,
                    client_ip=client_ip,
                    request_id=request_id,
                    detail={
                        "upstream_status": upstream_response.status_code,
                        "latency_ms": latency_ms,
                    },
                )

            return Response(
                content=upstream_response.content,
                status_code=upstream_response.status_code,
                headers=response_headers,
                media_type=content_type or "application/json",
            )

        except Exception:
            logger.exception("proxy.unhandled_error", server_slug=server_slug)
            return _json_error(request, 500, rpc_id, INTERNAL_ERROR, "Internal server error")


@router.get("/mcp/{server_slug}")
async def mcp_sse_stream(
    server_slug: str,
    request: Request,
) -> Response:
    """Open an upstream SSE event stream for the Streamable HTTP transport.

    Authentication, registry resolution, and rate limiting are enforced exactly
    as for POST requests; the upstream GET response (a live ``text/event-stream``)
    is streamed back to the client without buffering.  Any ``Mcp-Session-Id``
    issued by the upstream is persisted and echoed to the client.
    """
    runtime: Runtime = request.app.state.runtime
    from app.config import get_settings

    settings: Settings = get_settings()

    request_id = getattr(request.state, "request_id", None)
    client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

    try:
        pre_auth_limit, pre_auth_window = parse_default(settings.auth_rate_limit_default)
        pre_auth_result = await check_pre_auth_limit(
            client_ip,
            runtime.redis,
            pre_auth_limit,
            pre_auth_window,
        )
    except RedisError as exc:
        logger.error("proxy.pre_auth_redis_error", error=str(exc))
        return _json_error(request, 503, None, INTERNAL_ERROR, "Rate limit backend unavailable")

    if not pre_auth_result.allowed:
        headers = _rate_limit_headers(pre_auth_result)
        headers["Retry-After"] = str(int(pre_auth_result.retry_after_seconds))
        RATE_LIMIT_REJECTIONS.labels(server_slug="_pre_auth", scope="pre_auth").inc()
        return _json_error(
            request, 429, None, RATE_LIMITED, "Pre-auth rate limit exceeded", headers
        )

    authorization = request.headers.get("authorization", "")
    raw_token = authorization.removeprefix("Bearer ").strip()
    if not raw_token:
        AUTH_FAILURES.labels(reason="missing_credentials").inc()
        return _json_error(request, 401, None, UNAUTHORIZED, "Invalid or missing credentials")

    async with runtime.session_factory() as session:
        try:
            subject = await authenticate(raw_token, settings, session)
        except ValueError:
            AUTH_FAILURES.labels(reason="invalid_credentials").inc()
            await record_event(
                runtime.session_factory,
                event_type=AuditEventType.AUTH_FAILURE,
                outcome="denied",
                server_slug=server_slug,
                client_ip=client_ip,
                request_id=request_id,
            )
            return _json_error(request, 401, None, UNAUTHORIZED, "Invalid or missing credentials")

        try:
            repo = ServerRepository(session)
            server = await repo.get_by_slug(DEFAULT_TENANT_ID, server_slug)
            if server is None:
                return _json_error(
                    request, 503, None, UPSTREAM_UNAVAILABLE, f"Server '{server_slug}' not found"
                )
            if server.status in (ServerStatus.DISABLED, ServerStatus.UNHEALTHY):
                return _json_error(
                    request,
                    503,
                    None,
                    UPSTREAM_UNAVAILABLE,
                    f"Server '{server_slug}' is {server.status.value}",
                )

            rl_repo = RateLimitRepository(session)
            policies = await rl_repo.list(DEFAULT_TENANT_ID)
            policy = resolve_policy(
                subject.subject_id,
                server_slug,
                "stream",
                policies,
                settings.rate_limit_default,
            )
            try:
                limiter = RateLimiter(runtime.redis)
                rl_result = await limiter.check(
                    tenant_id=DEFAULT_TENANT_ID,
                    subject_id=subject.subject_id,
                    server_slug=server_slug,
                    tool_or_method="stream",
                    policy=policy,
                )
            except RedisError as exc:
                logger.error("proxy.rate_limit_redis_error", error=str(exc))
                return _json_error(
                    request, 503, None, INTERNAL_ERROR, "Rate limit backend unavailable"
                )

            rl_headers = _rate_limit_headers(rl_result)
            if not rl_result.allowed:
                retry_headers = dict(rl_headers)
                retry_headers["Retry-After"] = str(int(rl_result.retry_after_seconds))
                RATE_LIMIT_REJECTIONS.labels(server_slug=server_slug, scope="per_subject").inc()
                return _json_error(
                    request, 429, None, RATE_LIMITED, "Rate limit exceeded", retry_headers
                )

            service_token: str | None = None
            if server.auth_mode == ServerAuthMode.SERVICE_TOKEN:
                service_token = extract_service_token(server.service_token_env_var)

            upstream_headers = build_upstream_headers(dict(request.headers), service_token)
            inbound_session_id = request.headers.get("mcp-session-id")

            proxy = McpProxy(runtime.http_client, settings)
            try:
                upstream_response = await proxy.forward(
                    upstream_url=server.upstream_url,
                    path="",
                    method="GET",
                    headers=upstream_headers,
                    body=b"",
                    stream=True,
                )
            except UpstreamError as exc:
                logger.error("proxy.upstream_error", server_slug=server_slug, error=str(exc))
                return _json_error(
                    request, 502, None, UPSTREAM_UNAVAILABLE, "Upstream server error", rl_headers
                )

            upstream_session_id = upstream_response.headers.get("mcp-session-id")
            response_headers = dict(rl_headers)
            if request_id:
                response_headers["X-Request-Id"] = request_id
            if upstream_session_id:
                session_store = SessionStore(runtime.redis)
                if inbound_session_id and inbound_session_id != upstream_session_id:
                    await session_store.delete(inbound_session_id)
                await session_store.record(
                    upstream_session_id,
                    tenant_id=subject.tenant_id,
                    subject_id=subject.subject_id,
                    server_slug=server_slug,
                )
                response_headers["Mcp-Session-Id"] = upstream_session_id

            content_type = upstream_response.headers.get("content-type", "")

            async def _stream() -> Any:
                try:
                    async for chunk in upstream_response.aiter_bytes():
                        yield chunk
                finally:
                    await upstream_response.aclose()

            return StreamingResponse(
                _stream(),
                status_code=upstream_response.status_code,
                headers=response_headers,
                media_type=content_type or "text/event-stream",
            )

        except Exception:
            logger.exception("proxy.unhandled_error", server_slug=server_slug)
            return _json_error(request, 500, None, INTERNAL_ERROR, "Internal server error")
