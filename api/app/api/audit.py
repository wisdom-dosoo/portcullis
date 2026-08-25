"""Audit query and export endpoint boundary."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import admin_subject
from app.auth.subject import Subject
from app.models.orm import AuditEventType
from app.models.schemas import AuditLogView
from app.repositories.audit import AuditRepository

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogView])
async def list_audit_logs(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    event_type: Annotated[AuditEventType | None, Query()] = None,
    server_slug: Annotated[str | None, Query()] = None,
    subject_id: Annotated[str | None, Query()] = None,
    outcome: Annotated[str | None, Query()] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
) -> list[AuditLogView]:
    """Return audit log entries for the current tenant. Admin scope required.

    Results are ordered by created_at descending (newest first).

    Supports filtering by:
    - event_type: Type of audit event
    - server_slug: MCP server slug
    - subject_id: Subject identifier (API key UUID or OAuth sub)
    - outcome: "allowed", "denied", "error"
    - start_date: Filter events after this date (UTC)
    - end_date: Filter events before this date (UTC)
    """
    repo = AuditRepository(session)
    logs = await repo.list(
        subject.tenant_id,
        limit=limit,
        offset=offset,
        event_type=event_type,
        server_slug=server_slug,
        subject_id=subject_id,
        outcome=outcome,
        start_date=start_date,
        end_date=end_date,
    )
    return [AuditLogView.model_validate(log) for log in logs]


@router.get("/export")
async def export_audit_logs(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    format: Annotated[str, Query(pattern="^(csv|jsonl)$")] = "csv",
    event_type: Annotated[AuditEventType | None, Query()] = None,
    server_slug: Annotated[str | None, Query()] = None,
    subject_id: Annotated[str | None, Query()] = None,
    outcome: Annotated[str | None, Query()] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=10000)] = 10000,
) -> Response:
    """Export audit logs as CSV or JSONL.

    Supports the same filters as the list endpoint.
    Returns a streaming response to handle large exports efficiently.
    """
    repo = AuditRepository(session)
    logs = await repo.list(
        subject.tenant_id,
        limit=limit,
        offset=0,
        event_type=event_type,
        server_slug=server_slug,
        subject_id=subject_id,
        outcome=outcome,
        start_date=start_date,
        end_date=end_date,
    )

    if format == "jsonl":
        return _export_jsonl(logs)
    return _export_csv(logs)


def _export_csv(logs: list) -> StreamingResponse:
    """Export audit logs as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([
        "id",
        "tenant_id",
        "subject_id",
        "subject_type",
        "event_type",
        "server_slug",
        "tool_name",
        "rpc_method",
        "outcome",
        "client_ip",
        "request_id",
        "detail",
        "created_at",
    ])

    for log in logs:
        writer.writerow([
            str(log.id),
            str(log.tenant_id) if log.tenant_id else "",
            log.subject_id or "",
            log.subject_type.value if log.subject_type else "",
            log.event_type.value if log.event_type else "",
            log.server_slug or "",
            log.tool_name or "",
            log.rpc_method or "",
            log.outcome,
            log.client_ip or "",
            log.request_id or "",
            str(log.detail) if log.detail else "",
            log.created_at.isoformat() if log.created_at else "",
        ])

    output.seek(0)
    filename = f"audit_logs_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_jsonl(logs: list) -> StreamingResponse:
    """Export audit logs as JSONL (one JSON object per line)."""
    import json

    def generate():
        for log in logs:
            yield json.dumps({
                "id": str(log.id),
                "tenant_id": str(log.tenant_id) if log.tenant_id else None,
                "subject_id": log.subject_id,
                "subject_type": log.subject_type.value if log.subject_type else None,
                "event_type": log.event_type.value if log.event_type else None,
                "server_slug": log.server_slug,
                "tool_name": log.tool_name,
                "rpc_method": log.rpc_method,
                "outcome": log.outcome,
                "client_ip": log.client_ip,
                "request_id": log.request_id,
                "detail": log.detail,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }) + "\n"

    filename = f"audit_logs_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.jsonl"
    return StreamingResponse(
        generate(),
        media_type="application/jsonl",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )