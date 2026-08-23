"""Management API rate limiting middleware."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request, Response
from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.auth.authenticate import authenticate
from app.auth.jwt_validator import JwksCache
from app.auth.subject import Subject
from app.config import Settings
from app.limits.policies import parse_default, resolve_policy
from app.limits.redis_bucket import RateLimiter
from app.observability.metrics import RATE_LIMIT_REJECTIONS
from app.repositories.rate_limits import RateLimitRepository

if TYPE_CHECKING:
    from app.runtime import Runtime


class ManagementApiRateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware for /v1/* management API endpoints.

    Applies per-subject token bucket rate limiting using the existing
    rate limiter infrastructure. Only applies to paths starting with /v1/.
    """

    def __init__(
        self,
        app,
    ) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only apply to management API paths
        if not request.url.path.startswith("/v1/"):
            return await call_next(request)

        # Skip rate limiting for health check and metrics endpoints
        if request.url.path in {"/healthz", "/metrics"}:
            return await call_next(request)

        # Get runtime from app state (set during lifespan)
        runtime = getattr(request.app.state, "runtime", None)
        if runtime is None:
            return await call_next(request)

        settings = getattr(request.app.state, "settings", None)
        if settings is None:
            return await call_next(request)

        # Get client IP for pre-auth rate limiting
        client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

        # Parse default rate limit for management API
        mgmt_limit, mgmt_window = parse_default(settings.management_api_rate_limit_default)

        # Get or create JWKS cache from app state
        jwks_cache = getattr(request.app.state, "jwks_cache", None)
        if jwks_cache is None:
            jwks_cache = JwksCache(runtime.redis, settings.jwt_jwks_cache_ttl_seconds)
            request.app.state.jwks_cache = jwks_cache

        # Pre-auth rate limit by IP (optional, can be disabled)
        try:
            from app.limits.pre_auth import check_pre_auth_limit
            pre_auth_result = await check_pre_auth_limit(client_ip, runtime.redis, mgmt_limit, mgmt_window)
            if not pre_auth_result.allowed:
                return self._rate_limit_response(request, pre_auth_result, scope="pre_auth")
        except RedisError:
            # Fail open for pre-auth to avoid blocking legitimate traffic
            pass

        # Authenticate the request
        subject = await self._authenticate_request(request, runtime, settings, jwks_cache)
        if subject is None:
            # Unauthenticated requests will be handled by the endpoint's auth dependency
            return await call_next(request)

        # Check rate limit for this subject
        rl_result = None
        try:
            rl_result = await self._check_subject_rate_limit(subject, request.url.path, runtime, settings)
            if not rl_result.allowed:
                return self._rate_limit_response(request, rl_result, scope="management_api")
        except RedisError:
            # Fail open on Redis errors to avoid blocking legitimate traffic
            pass

        # Add rate limit headers to response
        response = await call_next(request)
        if rl_result:
            self._add_rate_limit_headers(response, rl_result)
        return response

    async def _authenticate_request(
        self,
        request: Request,
        runtime: Runtime,
        settings: Settings,
        jwks_cache: JwksCache,
    ) -> Subject | None:
        """Authenticate the request and return the subject."""
        authorization = request.headers.get("authorization", "")
        raw_token = authorization.removeprefix("Bearer ").strip()
        if not raw_token:
            return None

        try:
            # We need a session for API key verification
            async with runtime.session_factory() as session:
                return await authenticate(raw_token, settings, session, jwks_cache)
        except Exception:  # noqa: BLE001 - authentication failures are expected
            return None

    async def _check_subject_rate_limit(
        self,
        subject: Subject,
        path: str,
        runtime: Runtime,
        settings: Settings,
    ):
        """Check rate limit for the authenticated subject."""
        async with runtime.session_factory() as session:
            rl_repo = RateLimitRepository(session)
            policies = await rl_repo.list(subject.tenant_id)

        # Use path as the "tool_or_method" for management API rate limiting
        policy = resolve_policy(
            subject.subject_id,
            subject.subject_type,
            "management_api",
            path,
            policies,
            settings.management_api_rate_limit_default,
        )

        limiter = RateLimiter(runtime.redis)
        return await limiter.check(
            tenant_id=subject.tenant_id,
            subject_id=subject.subject_id,
            server_slug="management_api",
            tool_or_method=path,
            policy=policy,
        )

    def _rate_limit_response(self, request: Request, result, scope: str) -> Response:
        """Generate a rate limit exceeded response."""
        headers = {
            "RateLimit-Limit": str(result.limit),
            "RateLimit-Remaining": str(result.remaining),
            "RateLimit-Reset": str(int(result.reset_after_seconds)),
            "Retry-After": str(int(result.retry_after_seconds)),
        }
        RATE_LIMIT_REJECTIONS.labels(server_slug="management_api", scope=scope).inc()

        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"},
            headers=headers,
        )

    def _add_rate_limit_headers(self, response: Response, result) -> None:
        """Add rate limit headers to successful responses."""
        response.headers["RateLimit-Limit"] = str(result.limit)
        response.headers["RateLimit-Remaining"] = str(result.remaining)
        response.headers["RateLimit-Reset"] = str(int(result.reset_after_seconds))