"""Gateway health endpoint boundary."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.runtime import Runtime

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz(request: Request) -> JSONResponse:
    """Return readiness status for the database and Redis connections."""
    runtime: Runtime = request.app.state.runtime

    db_status = "ok"
    redis_status = "ok"

    # Check database independently so a DB failure doesn't skip Redis.
    try:
        async with runtime.session_factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        logger.warning("health.database.failed")
        db_status = "error"

    # Check Redis independently.
    try:
        await runtime.redis.ping()
    except Exception:  # noqa: BLE001
        logger.warning("health.redis.failed")
        redis_status = "error"

    healthy = db_status == "ok" and redis_status == "ok"
    status_code = 200 if healthy else 503
    overall = "ok" if healthy else "degraded"

    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall,
            "database": db_status,
            "redis": redis_status,
        },
    )
