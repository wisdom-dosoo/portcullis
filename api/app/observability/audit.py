"""Persistent gateway audit recording boundary."""

from __future__ import annotations

from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.orm import AuditEventType, SubjectType
from app.repositories.audit import AuditRepository

logger = structlog.get_logger(__name__)


async def record_event(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    event_type: AuditEventType,
    outcome: str,
    tenant_id: UUID | None = None,
    subject_id: str | None = None,
    subject_type: SubjectType | None = None,
    server_slug: str | None = None,
    tool_name: str | None = None,
    rpc_method: str | None = None,
    client_ip: str | None = None,
    request_id: str | None = None,
    detail: dict | None = None,
) -> None:
    """Write an audit event to the database using a dedicated session.

    Uses a separate DB session from the main request session so audit writes
    survive even if the main request transaction fails or is rolled back.
    Any database error is caught and logged — this function never raises,
    ensuring audit recording never breaks request handling.
    """
    try:
        async with session_factory() as session:
            await AuditRepository(session).create(
                event_type=event_type,
                outcome=outcome,
                tenant_id=tenant_id,
                subject_id=subject_id,
                subject_type=subject_type,
                server_slug=server_slug,
                tool_name=tool_name,
                rpc_method=rpc_method,
                client_ip=client_ip,
                request_id=request_id,
                detail=detail,
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001 - audit writes must never break the request
        logger.error(
            "audit.record_event.failed",
            event_type=event_type,
            outcome=outcome,
            error=str(exc),
        )
