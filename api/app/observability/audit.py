"""Persistent gateway audit recording boundary."""

from __future__ import annotations

from typing import Any
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
    detail: dict[str, Any] | None = None,
) -> None:
    """Write an audit event to the database using a dedicated session.

    Uses a separate DB session from the main request session so audit writes
    survive even if the main request transaction fails or is rolled back.
    Any database error is caught, spilled to the file DLQ
    (`audit_dlq_path`), and logged — this function never raises, ensuring
    audit recording never breaks request handling.
    """
    from app.observability.redact import redact_detail

    safe_detail = redact_detail(detail)
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
                detail=safe_detail,
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001 - audit writes must never break the request
        try:
            from app.observability.metrics import AUDIT_WRITE_FAILURES

            AUDIT_WRITE_FAILURES.inc()
        except Exception:  # noqa: BLE001, S110
            pass
        logger.error(
            "audit.record_event.failed",
            event_type=event_type,
            outcome=outcome,
            error=str(exc),
        )
        try:
            from app.config import get_settings

            dlq_path = get_settings().audit_dlq_path
        except Exception:  # noqa: BLE001
            dlq_path = ""
        if dlq_path:
            from app.observability.audit_dlq import spill_to_dlq

            try:
                from app.observability.metrics import AUDIT_DLQ_SPILLS
            except Exception:  # noqa: BLE001
                AUDIT_DLQ_SPILLS = None  # type: ignore[assignment]
            spilled = spill_to_dlq(
                dlq_path,
                {
                    "event_type": getattr(event_type, "value", str(event_type)),
                    "outcome": outcome,
                    "tenant_id": str(tenant_id) if tenant_id else None,
                    "subject_id": subject_id,
                    "subject_type": getattr(subject_type, "value", str(subject_type))
                    if subject_type
                    else None,
                    "server_slug": server_slug,
                    "tool_name": tool_name,
                    "rpc_method": rpc_method,
                    "client_ip": client_ip,
                    "request_id": request_id,
                    "detail": safe_detail,
                },
            )
            if AUDIT_DLQ_SPILLS is not None:
                try:
                    AUDIT_DLQ_SPILLS.labels(result="ok" if spilled else "failed").inc()
                except Exception:  # noqa: BLE001, S110
                    pass
