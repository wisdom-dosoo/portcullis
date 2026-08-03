"""FastAPI application construction and lifecycle boundary."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.api.health import router as health_router
from app.config import get_settings
from app.runtime import Runtime

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Build and tear down the process-wide Runtime around the server lifetime."""
    settings = get_settings()
    runtime = Runtime.build(settings)
    app.state.runtime = runtime
    logger.info("app.startup", environment=settings.environment)
    try:
        yield
    finally:
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

    return application


app = create_app()
