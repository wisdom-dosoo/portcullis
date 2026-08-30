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
from app.auth.jwt_validator import JwksCache
from app.auth.rbac import evaluate_permission
from app.auth.tool_filter import (
    filter_prompts_list,
    filter_resources_list,
    filter_roots_list,
    filter_tools_list,
)
from app.config import Settings
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
from app.observability.metrics import (
    AUTH_FAILURES,
    RATE_LIMIT_REJECTIONS,
    RBAC_DENIALS,
    UPSTREAM_REQUEST_DURATION,
)
from app.repositories.rate_limits import RateLimitRepository
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository
from app.runtime import Runtime
from app.usage import check_usage_cap, record_usage

router = APIRouter(tags=["proxy"])

logger = structlog.get_logger(__name__)


class _AuthContext:
    """Shared authentication and rate-limit context for proxy endpoints."""

    def __init__(
        self,
        request: Request,
        runtime: Runtime,
        settings: Settings,
        server_slug: str,
        session,
    ) -> None:
        self.request = request
        self.runtime = runtime
        self.settings = settings
        self.server_slug = server_slug
        self.session = session
        self.request_id = getattr(request.state, "request_id", None)
        self.client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"
        self.subject = None
        self.server = None
        self.rl_headers: dict[str, str] = {}
        self._jwks_cache = JwksCache(runtime.redis, settings.jwt_jwks_cache_ttl_seconds)

    async def run_pre_auth_checks(self, rpc_id: int | str | None = None) -> JSONResponse | None:
        """Run pre-auth rate limit and authentication. Returns error response or None on success."""
        try:
            pre_auth_limit, pre_auth_window = parse_default(self.settings.auth_rate_limit_default)
            pre_auth_result = await check_pre_auth_limit(
                self.client_ip,
                self.runtime.redis,
                pre_auth_limit,
                pre_auth_window,
            )
        except RedisError as exc:
            logger.error("proxy.pre_auth_redis_error", error=str(exc))
            return _json_error(
                self.request, 503, rpc_id, INTERNAL_ERROR, "Rate limit backend unavailable"
            )

        if not pre_auth_result.allowed:
            headers = _rate_limit_headers(pre_auth_result)
            headers["Retry-After"] = str(int(pre_auth_result.retry_after_seconds))
            RATE_LIMIT_REJECTIONS.labels(server_slug="_pre_auth", scope="pre_auth").inc()
            return _json_error(
                self.request, 429, rpc_id, RATE_LIMITED, "Pre-auth rate limit exceeded", headers
            )

        authorization = self.request.headers.get("authorization", "")
        raw_token = authorization.removeprefix("Bearer ").strip()
        if not raw_token:
            AUTH_FAILURES.labels(reason="missing_credentials").inc()
            return _json_error(
                self.request, 401, rpc_id, UNAUTHORIZED, "Invalid or missing credentials"
            )

        try:
            self.subject = await authenticate(
                raw_token, self.settings, self.session, self._jwks_cache
            )
        except ValueError:
            AUTH_FAILURES.labels(reason="invalid_credentials").inc()
            await record_event(
                self.runtime.session_factory,
                event_type=AuditEventType.AUTH_FAILURE,
                outcome="denied",
                server_slug=self.server_slug,
                client_ip=self.client_ip,
                request_id=self.request_id,
            )
            return _json_error(
                self.request, 401, rpc_id, UNAUTHORIZED, "Invalid or missing credentials"
            )

        return None

    async def resolve_server(self, rpc_id: int | str | None = None) -> JSONResponse | None:
        """Resolve and validate the upstream server. Returns error response or None on success."""
        if self.subject is None:
            return _json_error(
                self.request,
                500,
                rpc_id,
                INTERNAL_ERROR,
                "Authentication required before server resolution",
            )
        repo = ServerRepository(self.session)
        self.server = await repo.get_by_slug(self.subject.tenant_id, self.server_slug)
        if self.server is None:
            return _json_error(
                self.request,
                503,
                rpc_id,
                UPSTREAM_UNAVAILABLE,
                f"Server '{self.server_slug}' not found",
            )
        if self.server.status in (ServerStatus.DISABLED, ServerStatus.UNHEALTHY):
            return _json_error(
                self.request,
                503,
                rpc_id,
                UPSTREAM_UNAVAILABLE,
                f"Server '{self.server_slug}' is {self.server.status.value}",
            )
        return None

    async def check_rate_limit(
        self, tool_or_method: str, rpc_id: int | str | None = None
    ) -> JSONResponse | None:
        """Check rate limit for the request. Returns error response or None on success."""
        if self.subject is None:
            return _json_error(
                self.request,
                500,
                rpc_id,
                INTERNAL_ERROR,
                "Authentication required before rate limiting",
            )
        rl_repo = RateLimitRepository(self.session)
        policies = await rl_repo.list(self.subject.tenant_id)
        policy = resolve_policy(
            self.subject.subject_id,
            self.subject.subject_type,
            self.server_slug,
            tool_or_method,
            policies,
            self.settings.rate_limit_default,
        )
        try:
            limiter = RateLimiter(self.runtime.redis)
            rl_result = await limiter.check(
                tenant_id=self.subject.tenant_id,
                subject_id=self.subject.subject_id,
                server_slug=self.server_slug,
                tool_or_method=tool_or_method,
                policy=policy,
            )
        except RedisError as exc:
            logger.error("proxy.rate_limit_redis_error", error=str(exc))
            return _json_error(
                self.request, 503, rpc_id, INTERNAL_ERROR, "Rate limit backend unavailable"
            )

        self.rl_headers = _rate_limit_headers(rl_result)
        if not rl_result.allowed:
            retry_headers = dict(self.rl_headers)
            retry_headers["Retry-After"] = str(int(rl_result.retry_after_seconds))
            RATE_LIMIT_REJECTIONS.labels(server_slug=self.server_slug, scope="per_subject").inc()
            await record_usage(
                self.session,
                tenant_id=self.subject.tenant_id,
                rate_limit_rejections=1,
            )
            return _json_error(
                self.request, 429, rpc_id, RATE_LIMITED, "Rate limit exceeded", retry_headers
            )
        return None

    def build_upstream_headers(self) -> dict[str, str]:
        """Build headers to forward to upstream server."""
        service_token: str | None = None
        if self.server.auth_mode == ServerAuthMode.SERVICE_TOKEN:
            service_token = extract_service_token(self.server.service_token_env_var)
        return build_upstream_headers(dict(self.request.headers), service_token)


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

    # Plugin hook: PRE_AUTH — extensibility point (Gap 5)
    try:
        from app.plugins import PluginContext, PluginPhase, get_plugin_registry

        _registry = get_plugin_registry()
        # Only run if plugins are registered (no overhead when registry is empty)
        if _registry.get_plugins(PluginPhase.PRE_AUTH):
            from fastapi.responses import Response as _Resp

            ctx = PluginContext(request=request, phase=PluginPhase.PRE_AUTH)
            result = await _registry.execute_phase(PluginPhase.PRE_AUTH, ctx)
            if isinstance(result, _Resp):
                return result
    except Exception:
        # Plugins must never break the gateway — fail open with a log
        import structlog as _sl

        _sl.get_logger(__name__).warning("plugin.pre_auth_failed", server_slug=server_slug)

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
    async with runtime.session_factory() as session:
        try:
            ctx = _AuthContext(request, runtime, settings, server_slug, session)

            # Run pre-auth checks
            error = await ctx.run_pre_auth_checks(rpc_id)
            if error:
                return error

            # Resolve and validate server
            error = await ctx.resolve_server(rpc_id)
            if error:
                return error

            # -------------------------------------------------------------------------
            # Step 3: Derive MCP method and resource/tool name
            # -------------------------------------------------------------------------
            method = rpc_request.method
            resource_name: str | None = None
            if method == "tools/call" and rpc_request.params:
                resource_name = rpc_request.params.get("name")
            elif (
                method in {"resources/read", "resources/subscribe", "resources/unsubscribe"}
                and rpc_request.params
            ):
                resource_name = rpc_request.params.get("uri")
            elif method == "prompts/get" and rpc_request.params:
                resource_name = rpc_request.params.get("name")
            elif method == "sampling/createMessage" and rpc_request.params:
                resource_name = "createMessage"

            # -------------------------------------------------------------------------
            # Step 4: RBAC check for methods that require authorization
            # -------------------------------------------------------------------------
            rbac_required_methods = {
                "tools/call",
                "resources/read",
                "resources/subscribe",
                "resources/unsubscribe",
                "prompts/get",
                "sampling/createMessage",
            }
            if method in rbac_required_methods:
                if resource_name is None:
                    return _json_error(
                        request,
                        422,
                        rpc_id,
                        INVALID_PARAMS,
                        f"{method} requires resource identifier",
                    )

                rbac_repo = RbacRepository(session)
                permissions = await rbac_repo.get_permissions_for_subject(
                    ctx.subject.tenant_id,
                    ctx.subject.subject_type,
                    ctx.subject.subject_id,
                )
                decision = evaluate_permission(
                    ctx.subject.subject_id, server_slug, resource_name, permissions
                )
                if not decision.allowed:
                    RBAC_DENIALS.labels(server_slug=server_slug).inc()
                    await record_usage(
                        session,
                        tenant_id=ctx.subject.tenant_id,
                        rbac_denials=1,
                    )
                    await record_event(
                        runtime.session_factory,
                        event_type=AuditEventType.RBAC_DENY,
                        outcome="denied",
                        tenant_id=ctx.subject.tenant_id,
                        subject_id=ctx.subject.subject_id,
                        subject_type=ctx.subject.subject_type,
                        server_slug=server_slug,
                        tool_name=resource_name,
                        rpc_method=method,
                        client_ip=client_ip,
                        request_id=request_id,
                        detail={"rule_id": str(decision.rule_id), "reason": decision.reason},
                    )
                    return _json_error(
                        request,
                        403,
                        rpc_id,
                        FORBIDDEN,
                        f"Resource '{resource_name}' is not permitted",
                    )

            # -------------------------------------------------------------------------
            # Step 4b: Handle session/terminate - explicit session termination
            # -------------------------------------------------------------------------
            if method == "session/terminate":
                inbound_session_id = request.headers.get("mcp-session-id")
                if not inbound_session_id:
                    return _json_error(
                        request,
                        400,
                        rpc_id,
                        INVALID_PARAMS,
                        "session/terminate requires Mcp-Session-Id header",
                    )

                # Verify the session belongs to this subject
                session_store = SessionStore(runtime.redis)
                session_record = await session_store.lookup(inbound_session_id)
                if not session_record:
                    return _json_error(request, 404, rpc_id, INVALID_PARAMS, "Session not found")

                # Verify ownership
                if (
                    session_record.get("tenant_id") != str(ctx.subject.tenant_id)
                    or session_record.get("subject_id") != ctx.subject.subject_id
                    or session_record.get("server_slug") != server_slug
                ):
                    return _json_error(
                        request, 403, rpc_id, FORBIDDEN, "Not authorized to terminate this session"
                    )

                # Delete the session
                await session_store.delete(inbound_session_id)

                # Forward to upstream so it can also clean up
                upstream_headers = ctx.build_upstream_headers()
                proxy = McpProxy(runtime.http_client, settings)
                try:
                    upstream_response = await proxy.forward(
                        upstream_url=ctx.server.upstream_url,
                        path="",
                        method=request.method,
                        headers=upstream_headers,
                        body=body,
                        stream=False,
                        server=ctx.server,
                    )
                except UpstreamError as exc:
                    logger.error("proxy.upstream_error", server_slug=server_slug, error=str(exc))
                    return _json_error(
                        request,
                        502,
                        rpc_id,
                        UPSTREAM_UNAVAILABLE,
                        "Upstream server error",
                        ctx.rl_headers,
                    )

                # Build response headers
                response_headers = dict(ctx.rl_headers)
                if request_id:
                    response_headers["X-Request-Id"] = request_id

                # Audit the session termination
                await record_event(
                    runtime.session_factory,
                    event_type=AuditEventType.TOOL_CALL,
                    outcome="allowed",
                    tenant_id=ctx.subject.tenant_id,
                    subject_id=ctx.subject.subject_id,
                    subject_type=ctx.subject.subject_type,
                    server_slug=server_slug,
                    tool_name="session/terminate",
                    rpc_method=method,
                    client_ip=client_ip,
                    request_id=request_id,
                    detail={"terminated_session_id": inbound_session_id},
                )

                return Response(
                    content=upstream_response.content,
                    status_code=upstream_response.status_code,
                    headers=response_headers,
                    media_type="application/json",
                )

            # -------------------------------------------------------------------------
            # Step 5: Resolve rate-limit policy and check
            # -------------------------------------------------------------------------
            error = await ctx.check_rate_limit(resource_name or method, rpc_id)
            if error:
                return error

            # -------------------------------------------------------------------------
            # Step 5b: Usage-billing cap check (opt-in, self-host unlimited by default)
            # -------------------------------------------------------------------------
            await record_usage(
                session,
                tenant_id=ctx.subject.tenant_id,
                requests=1,
                tool_calls=1 if method == "tools/call" else 0,
            )
            if method == "tools/call":
                under_cap = await check_usage_cap(session, ctx.subject.tenant_id, settings)
                if not under_cap:
                    return _json_error(
                        request,
                        402,
                        rpc_id,
                        INVALID_REQUEST,
                        "Monthly usage cap reached for this plan",
                    )

            # -------------------------------------------------------------------------
            # Step 6: Build upstream headers
            # -------------------------------------------------------------------------
            upstream_headers = ctx.build_upstream_headers()

            # Preserve the client's session id across the hop.  ``build_upstream_headers``
            # copies allowed headers verbatim, so inbound Mcp-Session-Id already flows
            # upstream; the value is captured here for validation and re-issue below.
            inbound_session_id = request.headers.get("mcp-session-id")

            # -------------------------------------------------------------------------
            # Step 7: Forward to upstream (buffered unless the method implies SSE)
            # -------------------------------------------------------------------------
            should_stream = request.headers.get("accept") == "text/event-stream"
            proxy = McpProxy(runtime.http_client, settings)
            upstream_start = time.perf_counter()
            try:
                upstream_response = await proxy.forward(
                    upstream_url=ctx.server.upstream_url,
                    path="",
                    method=request.method,
                    headers=upstream_headers,
                    body=body,
                    stream=should_stream,
                    server=ctx.server,
                )
            except UpstreamError as exc:
                logger.error("proxy.upstream_error", server_slug=server_slug, error=str(exc))
                return _json_error(
                    request,
                    502,
                    rpc_id,
                    UPSTREAM_UNAVAILABLE,
                    "Upstream server error",
                    ctx.rl_headers,
                )
            finally:
                UPSTREAM_REQUEST_DURATION.labels(server_slug=server_slug).observe(
                    time.perf_counter() - upstream_start
                )

            # Capture upstream session id once the response headers are known.
            upstream_session_id = upstream_response.headers.get("mcp-session-id")

            # -------------------------------------------------------------------------
            # Step 8 / 9: Handle response
            # -------------------------------------------------------------------------

            # Notifications: return 202 with no body.
            if rpc_id is None:
                response_headers = dict(ctx.rl_headers)
                if request_id:
                    response_headers["X-Request-Id"] = request_id
                if upstream_session_id and upstream_session_id != inbound_session_id:
                    response_headers["Mcp-Session-Id"] = upstream_session_id
                return Response(status_code=202, headers=response_headers)

            # Build base response headers
            response_headers = dict(ctx.rl_headers)
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
                    tenant_id=ctx.subject.tenant_id,
                    subject_id=ctx.subject.subject_id,
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

            # tools/list, resources/list, prompts/list, roots/list: buffer, parse, filter, return
            if method in {"tools/list", "resources/list", "prompts/list", "roots/list"}:
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

                if method == "tools/list":
                    filtered = await filter_tools_list(
                        response_body, ctx.subject, server_slug, session
                    )
                elif method == "resources/list":
                    filtered = await filter_resources_list(
                        response_body, ctx.subject, server_slug, session
                    )
                elif method == "prompts/list":
                    filtered = await filter_prompts_list(
                        response_body, ctx.subject, server_slug, session
                    )
                elif method == "roots/list":
                    filtered = await filter_roots_list(
                        response_body, ctx.subject, server_slug, session
                    )
                else:
                    filtered = response_body

                return JSONResponse(
                    content=filtered,
                    status_code=upstream_response.status_code,
                    headers=response_headers,
                )

            # Default: buffer and return. Audit tool calls and other operations on success.
            if (
                method in {"tools/call", "resources/read", "prompts/get", "sampling/createMessage"}
                and upstream_response.status_code < 500
            ):
                latency_ms = int((time.perf_counter() - start_time) * 1000)
                await record_event(
                    runtime.session_factory,
                    event_type=AuditEventType.TOOL_CALL,
                    outcome="allowed",
                    tenant_id=ctx.subject.tenant_id,
                    subject_id=ctx.subject.subject_id,
                    subject_type=ctx.subject.subject_type,
                    server_slug=server_slug,
                    tool_name=resource_name,
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

    async with runtime.session_factory() as session:
        try:
            ctx = _AuthContext(request, runtime, settings, server_slug, session)

            # Run pre-auth checks
            error = await ctx.run_pre_auth_checks()
            if error:
                return error

            # Resolve and validate server
            error = await ctx.resolve_server()
            if error:
                return error

            # Check rate limit for stream
            error = await ctx.check_rate_limit("stream")
            if error:
                return error

            # Record usage for the streaming connection (one request, no tool call).
            await record_usage(session, tenant_id=ctx.subject.tenant_id, requests=1)

            # Build upstream headers
            upstream_headers = ctx.build_upstream_headers()
            inbound_session_id = request.headers.get("mcp-session-id")

            proxy = McpProxy(runtime.http_client, settings)
            upstream_start = time.perf_counter()
            try:
                upstream_response = await proxy.forward(
                    upstream_url=ctx.server.upstream_url,
                    path="",
                    method="GET",
                    headers=upstream_headers,
                    body=b"",
                    stream=True,
                    server=ctx.server,
                )
            except UpstreamError as exc:
                logger.error("proxy.upstream_error", server_slug=server_slug, error=str(exc))
                return _json_error(
                    request,
                    502,
                    None,
                    UPSTREAM_UNAVAILABLE,
                    "Upstream server error",
                    ctx.rl_headers,
                )
            finally:
                UPSTREAM_REQUEST_DURATION.labels(server_slug=server_slug).observe(
                    time.perf_counter() - upstream_start
                )

            upstream_session_id = upstream_response.headers.get("mcp-session-id")
            response_headers = dict(ctx.rl_headers)
            if request_id:
                response_headers["X-Request-Id"] = request_id
            if upstream_session_id:
                session_store = SessionStore(runtime.redis)
                if inbound_session_id and inbound_session_id != upstream_session_id:
                    await session_store.delete(inbound_session_id)
                await session_store.record(
                    upstream_session_id,
                    tenant_id=ctx.subject.tenant_id,
                    subject_id=ctx.subject.subject_id,
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
