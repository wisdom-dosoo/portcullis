"""FastAPI application construction and lifecycle boundary."""

from __future__ import annotations

import asyncio
import traceback
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.api.health import router as health_router
from app.config import get_settings
from app.gateway.health_monitor import HealthMonitor
from app.runtime import Runtime

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Build and tear down the process-wide Runtime around the server lifetime."""
    settings = get_settings()
    runtime = Runtime.build(settings)
    app.state.runtime = runtime

    monitor = HealthMonitor(runtime.session_factory, runtime.http_client, settings)
    app.state.monitor = monitor
    monitor_task = asyncio.create_task(monitor.start())

    logger.info("app.startup", environment=settings.environment)
    try:
        yield
    finally:
        await monitor.stop()
        await monitor_task
        await runtime.close()
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
        version="0.1.0",
        lifespan=lifespan,
        default_response_class=JSONResponse,
    )

    application.add_middleware(RequestIdMiddleware)
    application.include_router(health_router)

    from app.api.servers import router as servers_router

    application.include_router(servers_router)

    from app.api.api_keys import router as api_keys_router

    application.include_router(api_keys_router)

    from app.api.roles import router as roles_router

    application.include_router(roles_router)

    from app.api.rate_limits import router as rate_limits_router

    application.include_router(rate_limits_router)

    from app.gateway.router import router as proxy_router

    application.include_router(proxy_router)

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        logger.error("unhandled_exception", path=request.url.path, error=str(exc), traceback=tb)
        return JSONResponse(status_code=500, content={"detail": f"UNHANDLED: {type(exc).__name__}: {exc}"})

    return application


app = create_app()
