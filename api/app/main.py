"""FastAPI application construction and lifecycle boundary."""

from __future__ import annotations

import asyncio
import time
import traceback
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import Response as PlainResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app import __version__
from app.api.health import router as health_router
from app.config import get_settings
from app.gateway.health_monitor import HealthMonitor
from app.gateway.management_rate_limit import ManagementApiRateLimitMiddleware
from app.gateway.origin_check import OriginValidationMiddleware
from app.observability.metrics import REQUEST_DURATION, REQUESTS_TOTAL, metrics_response
from app.observability.otel import configure_otel, shutdown_otel
from app.runtime import Runtime

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Build and tear down the process-wide Runtime around the server lifetime."""
    settings = get_settings()

    # Initialise OpenTelemetry before anything else so auto-instrumentation
    # is active for the full lifetime of the process.
    otel_provider = configure_otel(settings)

    runtime = Runtime.build(settings)
    app.state.runtime = runtime
    app.state.settings = settings

    monitor = HealthMonitor(runtime.session_factory, runtime.http_client, settings)
    app.state.monitor = monitor
    monitor_task = asyncio.create_task(monitor.start())

    # Opt-in self-host telemetry: only runs when the operator enables it AND
    # points telemetry_endpoint_url at a receiving /v1/telemetry/heartbeat.
    telemetry_task = None
    if settings.telemetry_enabled and settings.telemetry_endpoint_url:
        from app.telemetry.identity import InstallIdentity
        from app.telemetry.reporter import TelemetryReporter

        identity = InstallIdentity(
            install_id=settings.telemetry_install_id,
            state_file=settings.telemetry_state_file,
        )
        reporter = TelemetryReporter(
            settings=settings,
            session_factory=runtime.session_factory,
            http_client=runtime.http_client,
            identity=identity,
        )
        app.state.telemetry_reporter = reporter
        telemetry_task = asyncio.create_task(reporter.start())

    logger.info("app.startup", environment=settings.environment)
    try:
        yield
    finally:
        if telemetry_task is not None:
            await app.state.telemetry_reporter.stop()
            await telemetry_task
        await monitor.stop()
        await monitor_task
        await runtime.close()
        shutdown_otel(otel_provider)
        logger.info("app.shutdown")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request-scoped ID to every inbound request and outbound response."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


class MetricsMiddleware(BaseHTTPMiddleware):
    """Record per-request Prometheus latency and count metrics.

    Only instruments non-metrics paths to avoid recursion and noise.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path == "/metrics":
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start

        # Use a fixed label for MCP proxy paths — the slug is user-supplied and
        # unvalidated here, so using it directly would create unbounded Prometheus
        # cardinality (label cardinality bomb).  Per-server metrics are emitted
        # from within router.py after the server is validated against the registry.
        path = request.url.path
        if path.startswith("/mcp/"):
            server_slug = "proxy"
            method_label = "proxy"
        else:
            server_slug = "control_plane"
            method_label = request.method.lower()

        REQUESTS_TOTAL.labels(
            server_slug=server_slug,
            method=method_label,
            status_code=str(response.status_code),
        ).inc()
        REQUEST_DURATION.labels(
            server_slug=server_slug,
            method=method_label,
        ).observe(duration)

        return response


def create_app() -> FastAPI:
    """Construct and configure the Portcullis gateway application."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )

    application = FastAPI(
        title="Portcullis",
        version=__version__,
        lifespan=lifespan,
        default_response_class=JSONResponse,
    )

    settings = get_settings()

    application.add_middleware(MetricsMiddleware)
    application.add_middleware(RequestIdMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins_tuple),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_middleware(OriginValidationMiddleware, settings=settings)
    application.add_middleware(ManagementApiRateLimitMiddleware)
    application.include_router(health_router)

    from app.api.auth import router as auth_router

    application.include_router(auth_router)

    from app.api.sso import router as sso_router

    application.include_router(sso_router)

    from app.api.servers import router as servers_router

    application.include_router(servers_router)

    from app.api.api_keys import router as api_keys_router

    application.include_router(api_keys_router)

    from app.api.roles import router as roles_router

    application.include_router(roles_router)

    from app.api.rate_limits import router as rate_limits_router

    application.include_router(rate_limits_router)

    from app.api.audit import router as audit_router

    application.include_router(audit_router)

    from app.api.platform import router as platform_router

    application.include_router(platform_router)

    from app.api.scim import router as scim_router

    application.include_router(scim_router)

    from app.api.tenants import router as tenants_router

    application.include_router(tenants_router)

    from app.api.usage import router as usage_router

    application.include_router(usage_router)

    from app.api.telemetry import router as telemetry_router

    application.include_router(telemetry_router)


    from app.gateway.router import router as proxy_router

    application.include_router(proxy_router)

    if settings.metrics_enabled:

        @application.get("/metrics", include_in_schema=False)
        async def prometheus_metrics() -> PlainResponse:
            """Expose Prometheus metrics for scraping."""
            body, content_type = metrics_response()
            return PlainResponse(content=body, media_type=content_type)

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        logger.error("unhandled_exception", path=request.url.path, error=str(exc), traceback=tb)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # Wire FastAPI auto-instrumentation after the app and all routers are set up.
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(application)
    except ImportError:
        pass  # OTel not available — graceful degradation

    return application


app = create_app()
