"""SOC 2 audit log export boundary.

Exports audit log entries in formats suitable for SOC 2 compliance review:
- CSV for spreadsheet analysis
- JSON for programmatic consumption
- Structured report with summary statistics
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import AuditLog

logger = structlog.get_logger(__name__)


@dataclass
class AuditExportFilters:
    """Filters for audit log export queries."""

    start_date: datetime | None = None
    end_date: datetime | None = None
    tenant_id: Any | None = None
    subject_id: str | None = None
    subject_type: str | None = None
    server_id: Any | None = None
    rpc_method: str | None = None
    tool_name: str | None = None
    status: str | None = None
    limit: int = 10000


@dataclass
class AuditExportSummary:
    """Aggregate statistics for an audit export."""

    total_events: int = 0
    allowed_count: int = 0
    denied_rbac_count: int = 0
    denied_rate_limit_count: int = 0
    error_count: int = 0
    unique_subjects: int = 0
    unique_servers: int = 0
    unique_tools: int = 0
    date_range_start: str | None = None
    date_range_end: str | None = None
    export_generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AuditExportService:
    """Service for exporting audit logs in SOC 2 compliance formats."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _query_entries(self, filters: AuditExportFilters) -> list[dict[str, Any]]:
        """Query audit log entries with the given filters."""
        stmt = select(AuditLog)

        if filters.tenant_id is not None:
            stmt = stmt.where(AuditLog.tenant_id == filters.tenant_id)
        if filters.start_date is not None:
            stmt = stmt.where(AuditLog.created_at >= filters.start_date)
        if filters.end_date is not None:
            stmt = stmt.where(AuditLog.created_at <= filters.end_date)
        if filters.subject_id is not None:
            stmt = stmt.where(AuditLog.subject_id == filters.subject_id)
        if filters.subject_type is not None:
            stmt = stmt.where(AuditLog.subject_type == filters.subject_type)
        if filters.server_id is not None:
            stmt = stmt.where(AuditLog.server_id == filters.server_id)
        if filters.rpc_method is not None:
            stmt = stmt.where(AuditLog.rpc_method == filters.rpc_method)
        if filters.tool_name is not None:
            stmt = stmt.where(AuditLog.tool_name == filters.tool_name)
        if filters.status is not None:
            stmt = stmt.where(AuditLog.status == filters.status)

        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(filters.limit)

        result = await self._session.execute(stmt)
        rows = result.scalars().all()

        return [
            {
                "id": str(row.id),
                "timestamp": row.created_at.isoformat() if row.created_at else None,
                "tenant_id": str(row.tenant_id) if row.tenant_id else None,
                "subject_id": row.subject_id,
                "subject_type": row.subject_type.value if hasattr(row.subject_type, "value") else row.subject_type,
                "server_id": str(row.server_id) if row.server_id else None,
                "rpc_method": row.rpc_method,
                "tool_name": row.tool_name,
                "status": row.status,
                "latency_ms": row.latency_ms,
                "request_id": row.request_id,
            }
            for row in rows
        ]

    async def _compute_summary(self, filters: AuditExportFilters) -> AuditExportSummary:
        """Compute aggregate statistics for the filtered audit log."""
        base_filter = []
        if filters.tenant_id is not None:
            base_filter.append(AuditLog.tenant_id == filters.tenant_id)
        if filters.start_date is not None:
            base_filter.append(AuditLog.created_at >= filters.start_date)
        if filters.end_date is not None:
            base_filter.append(AuditLog.created_at <= filters.end_date)

        # Total events
        total_stmt = select(func.count(AuditLog.id))
        for f in base_filter:
            total_stmt = total_stmt.where(f)
        total = (await self._session.execute(total_stmt)).scalar() or 0

        # Status breakdown
        status_stmt = select(AuditLog.status, func.count(AuditLog.id))
        for f in base_filter:
            status_stmt = status_stmt.where(f)
        status_stmt = status_stmt.group_by(AuditLog.status)
        status_rows = (await self._session.execute(status_stmt)).all()

        summary = AuditExportSummary(total_events=total)
        for status_val, count in status_rows:
            status_str = status_val.value if hasattr(status_val, "value") else str(status_val)
            if status_str == "allowed":
                summary.allowed_count = count
            elif status_str == "denied_rbac":
                summary.denied_rbac_count = count
            elif status_str == "denied_rate_limit":
                summary.denied_rate_limit_count = count
            elif status_str == "error":
                summary.error_count = count

        # Unique counts
        for col, attr in [
            (AuditLog.subject_id, "unique_subjects"),
            (AuditLog.server_id, "unique_servers"),
            (AuditLog.tool_name, "unique_tools"),
        ]:
            distinct_stmt = select(func.count(func.distinct(col)))
            for f in base_filter:
                distinct_stmt = distinct_stmt.where(f)
            setattr(summary, attr, (await self._session.execute(distinct_stmt)).scalar() or 0)

        # Date range
        range_stmt = select(func.min(AuditLog.created_at), func.max(AuditLog.created_at))
        for f in base_filter:
            range_stmt = range_stmt.where(f)
        range_row = (await self._session.execute(range_stmt)).one_or_none()
        if range_row and range_row[0]:
            summary.date_range_start = range_row[0].isoformat()
        if range_row and range_row[1]:
            summary.date_range_end = range_row[1].isoformat()

        return summary

    async def export_csv(self, filters: AuditExportFilters) -> str:
        """Export audit log entries as CSV."""
        entries = await self._query_entries(filters)
        if not entries:
            return ""

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=entries[0].keys())
        writer.writeheader()
        writer.writerows(entries)
        return output.getvalue()

    async def export_json(self, filters: AuditExportFilters) -> dict[str, Any]:
        """Export audit log entries as structured JSON with summary."""
        entries = await self._query_entries(filters)
        summary = await self._compute_summary(filters)
        return {
            "metadata": {
                "format": "portcullis_audit_export_v1",
                "generated_at": summary.export_generated_at,
                "filters_applied": {
                    "start_date": filters.start_date.isoformat() if filters.start_date else None,
                    "end_date": filters.end_date.isoformat() if filters.end_date else None,
                    "subject_id": filters.subject_id,
                    "server_id": str(filters.server_id) if filters.server_id else None,
                    "status": filters.status,
                },
            },
            "summary": {
                "total_events": summary.total_events,
                "allowed_count": summary.allowed_count,
                "denied_rbac_count": summary.denied_rbac_count,
                "denied_rate_limit_count": summary.denied_rate_limit_count,
                "error_count": summary.error_count,
                "unique_subjects": summary.unique_subjects,
                "unique_servers": summary.unique_servers,
                "unique_tools": summary.unique_tools,
                "date_range": {
                    "start": summary.date_range_start,
                    "end": summary.date_range_end,
                },
            },
            "entries": entries,
        }

    async def export_soc2_report(self, filters: AuditExportFilters) -> dict[str, Any]:
        """Generate a SOC 2 oriented compliance report.

        Maps audit events to SOC 2 Trust Services Criteria:
        - CC6.1 (Logical Access): RBAC denials and auth failures
        - CC6.6 (System Boundaries): Rate limit rejections
        - CC7.2 (Monitoring): All events logged
        - CC7.3 (Anomaly Detection): Error events
        """
        entries = await self._query_entries(filters)
        summary = await self._compute_summary(filters)

        # Map events to SOC 2 criteria
        access_events = [e for e in entries if e["status"] in ("denied_rbac",)]
        boundary_events = [e for e in entries if e["status"] == "denied_rate_limit"]
        monitoring_events = entries
        anomaly_events = [e for e in entries if e["status"] == "error"]

        return {
            "report_type": "SOC 2 Trust Services Criteria - Audit Evidence",
            "generated_at": summary.export_generated_at,
            "reporting_period": {
                "start": summary.date_range_start,
                "end": summary.date_range_end,
            },
            "trust_services_criteria": {
                "CC6.1_logical_access": {
                    "description": "Access controls enforced via RBAC and authentication",
                    "total_events": len(access_events),
                    "denied_rbac_count": summary.denied_rbac_count,
                    "events": access_events[:100],  # Cap for report size
                },
                "CC6.6_system_boundaries": {
                    "description": "Rate limiting enforces backpressure on inbound requests",
                    "total_events": len(boundary_events),
                    "denied_rate_limit_count": summary.denied_rate_limit_count,
                    "events": boundary_events[:100],
                },
                "CC7.2_monitoring": {
                    "description": "All access events are logged for monitoring and review",
                    "total_events": summary.total_events,
                    "allowed_count": summary.allowed_count,
                    "unique_subjects": summary.unique_subjects,
                    "unique_servers": summary.unique_servers,
                },
                "CC7.3_anomaly_detection": {
                    "description": "Error events that may indicate anomalous behavior",
                    "total_events": len(anomaly_events),
                    "error_count": summary.error_count,
                    "events": anomaly_events[:100],
                },
            },
            "summary": {
                "total_events": summary.total_events,
                "allowed_count": summary.allowed_count,
                "denied_rbac_count": summary.denied_rbac_count,
                "denied_rate_limit_count": summary.denied_rate_limit_count,
                "error_count": summary.error_count,
                "unique_subjects": summary.unique_subjects,
                "unique_servers": summary.unique_servers,
                "unique_tools": summary.unique_tools,
            },
        }
