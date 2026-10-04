"""Audit query and export endpoint boundary."""

from __future__ import annotations

import csv
import io
import json
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
from app.observability.audit_export import AuditExportFilters, AuditExportService
from app.repositories.audit import AuditRepository

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogView])
async def list_audit_logs(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    response: Response,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    event_type: Annotated[AuditEventType | None, Query()] = None,
    server_slug: Annotated[str | None, Query(max_length=200)] = None,
    subject_id: Annotated[str | None, Query(max_length=500)] = None,
    outcome: Annotated[str | None, Query(pattern="^(allowed|denied|error)$")] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
) -> list[AuditLogView]:
    """Return audit log entries for the current tenant (P1: paginated + total).

    Results are ordered by created_at descending (newest first).
    Total matching rows are exposed via ``X-Total-Count`` so the dashboard can
    page beyond the first 200 rows.
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
    total = await repo.count(
        subject.tenant_id,
        event_type=event_type,
        server_slug=server_slug,
        subject_id=subject_id,
        outcome=outcome,
        start_date=start_date,
        end_date=end_date,
    )
    response.headers["X-Total-Count"] = str(total)
    return [AuditLogView.model_validate(log) for log in logs]


@router.get("/export")
async def export_audit_logs(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    format: Annotated[str, Query(pattern="^(csv|jsonl)$")] = "csv",
    event_type: Annotated[AuditEventType | None, Query()] = None,
    server_slug: Annotated[str | None, Query(max_length=200)] = None,
    subject_id: Annotated[str | None, Query(max_length=500)] = None,
    outcome: Annotated[str | None, Query(pattern="^(allowed|denied|error)$")] = None,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=10000)] = 10000,
) -> Response:
    """Export audit logs as CSV or JSONL (P1: truly streamed in batches).

    Pages the repository in 1000-row batches so a 10k export never buffers the
    full result set + StringIO in memory.
    """
    if format == "jsonl":
        return _export_jsonl_streamed(
            session,
            subject,
            event_type=event_type,
            server_slug=server_slug,
            subject_id=subject_id,
            outcome=outcome,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
    return _export_csv_streamed(
        session,
        subject,
        event_type=event_type,
        server_slug=server_slug,
        subject_id=subject_id,
        outcome=outcome,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )


@router.get("/soc2")
async def export_soc2_report(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    subject_id: Annotated[str | None, Query()] = None,
    server_slug: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50000)] = 10000,
) -> Response:
    """Export a SOC 2 compliance report mapping audit events to Trust Services Criteria.

    Returns a structured JSON report with events mapped to:
    - CC6.1 (Logical Access): RBAC denials and auth failures
    - CC6.6 (System Boundaries): Rate limit rejections
    - CC7.2 (Monitoring): All events logged
    - CC7.3 (Anomaly Detection): Error events
    """
    export_service = AuditExportService(session)
    filters = AuditExportFilters(
        start_date=start_date,
        end_date=end_date,
        tenant_id=subject.tenant_id,
        subject_id=subject_id,
        status=status,
        limit=limit,
    )
    report = await export_service.export_soc2_report(filters)

    filename = f"soc2_report_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=json.dumps(report, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_csv(logs: list) -> StreamingResponse:
    """Export audit logs as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(
        [
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
        ]
    )

    for log in logs:
        writer.writerow(
            [
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
            ]
        )

    output.seek(0)
    filename = f"audit_logs_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_jsonl(logs: list) -> StreamingResponse:
    """Export audit logs as JSONL (one JSON object per line, legacy buffered)."""

    def generate():
        for log in logs:
            yield (
                json.dumps(
                    {
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
                    }
                )
                + "\n"
            )

    filename = f"audit_logs_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.jsonl"
    return StreamingResponse(
        generate(),
        media_type="application/jsonl",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _csv_row(log) -> list[str]:
    """Render one audit row for CSV export."""
    return [
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
    ]


def _export_csv_streamed(
    session,
    subject,
    *,
    event_type=None,
    server_slug=None,
    subject_id=None,
    outcome=None,
    start_date=None,
    end_date=None,
    limit=10000,
) -> StreamingResponse:
    """Stream CSV export in 1000-row batches (P1: no full buffering)."""
    batch = 1000

    # True async streaming via an async generator paging the repository.
    async def aiter_batches():
        import csv as _csv
        import io as _io

        buf = _io.StringIO()
        w = _csv.writer(buf)
        w.writerow(
            [
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
            ]
        )
        yield buf.getvalue()
        fetched = 0
        repo = AuditRepository(session)
        while fetched < limit:
            size = min(batch, limit - fetched)
            logs = await repo.list(
                subject.tenant_id,
                limit=size,
                offset=fetched,
                event_type=event_type,
                server_slug=server_slug,
                subject_id=subject_id,
                outcome=outcome,
                start_date=start_date,
                end_date=end_date,
            )
            if not logs:
                break
            out = _io.StringIO()
            w2 = _csv.writer(out)
            for log in logs:
                w2.writerow(_csv_row(log))
            yield out.getvalue()
            fetched += len(logs)
            if len(logs) < size:
                break

    filename = f"audit_logs_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        aiter_batches(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _export_jsonl_streamed(
    session,
    subject,
    *,
    event_type=None,
    server_slug=None,
    subject_id=None,
    outcome=None,
    start_date=None,
    end_date=None,
    limit=10000,
) -> StreamingResponse:
    """Stream JSONL export in 1000-row batches (P1: no full buffering)."""
    import json as _json

    batch = 1000

    async def aiter_batches():
        repo = AuditRepository(session)
        fetched = 0
        while fetched < limit:
            size = min(batch, limit - fetched)
            logs = await repo.list(
                subject.tenant_id,
                limit=size,
                offset=fetched,
                event_type=event_type,
                server_slug=server_slug,
                subject_id=subject_id,
                outcome=outcome,
                start_date=start_date,
                end_date=end_date,
            )
            if not logs:
                break
            for log in logs:
                yield (
                    _json.dumps(
                        {
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
                        }
                    )
                    + "\n"
                )
            fetched += len(logs)
            if len(logs) < size:
                break

    filename = f"audit_logs_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.jsonl"
    return StreamingResponse(
        aiter_batches(),
        media_type="application/jsonl",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
