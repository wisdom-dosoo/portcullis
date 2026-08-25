"""Audit log repository for persisting and querying audit records."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import AuditEventType, AuditLog, SubjectType


class AuditRepository:
    """Data access layer for audit log records scoped to a tenant."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
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
    ) -> AuditLog:
        """Persist a new audit log record and return the ORM instance.

        Adds the record to the session and flushes (does NOT commit — caller commits).
        """
        log = AuditLog(
            tenant_id=tenant_id,
            subject_id=subject_id,
            subject_type=subject_type,
            event_type=event_type,
            server_slug=server_slug,
            tool_name=tool_name,
            rpc_method=rpc_method,
            outcome=outcome,
            client_ip=client_ip,
            request_id=request_id,
            detail=detail if detail is not None else {},
        )
        self._session.add(log)
        await self._session.flush()
        return log

    async def list(
        self,
        tenant_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0,
        event_type: AuditEventType | None = None,
        server_slug: str | None = None,
        subject_id: str | None = None,
        outcome: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[AuditLog]:
        """Return audit logs for the given tenant ordered by created_at DESC.

        Applies filters when provided:
        - event_type: Filter by event type
        - server_slug: Filter by MCP server slug
        - subject_id: Filter by subject identifier
        - outcome: Filter by outcome ("allowed", "denied", "error")
        - start_date: Filter events on or after this date (UTC)
        - end_date: Filter events on or before this date (UTC)
        """
        stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if event_type is not None:
            stmt = stmt.where(AuditLog.event_type == event_type)
        if server_slug is not None:
            stmt = stmt.where(AuditLog.server_slug == server_slug)
        if subject_id is not None:
            stmt = stmt.where(AuditLog.subject_id == subject_id)
        if outcome is not None:
            stmt = stmt.where(AuditLog.outcome == outcome)
        if start_date is not None:
            stmt = stmt.where(AuditLog.created_at >= start_date)
        if end_date is not None:
            stmt = stmt.where(AuditLog.created_at <= end_date)
        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        result = await self._session.scalars(stmt)
        return list(result.all())

    # --- Tamper-evident chain support ---

    async def get_last_entry(self) -> AuditLog | None:
        """Get the most recent audit log entry (for chain chaining)."""
        result = await self._session.scalars(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(1)
        )
        return result.first()

    async def get_chain_entries(
        self,
        from_index: int = 0,
        to_index: int | None = None,
    ) -> list[AuditLog]:
        """Get audit log entries for chain verification, ordered by creation.

        Returns entries in chronological order (oldest first) for chain verification.
        """
        stmt = select(AuditLog).order_by(AuditLog.created_at.asc()).offset(from_index)
        if to_index is not None:
            stmt = stmt.limit(to_index - from_index)
        result = await self._session.scalars(stmt)
        return list(result.all())

    async def get_by_id(self, audit_id: UUID) -> AuditLog | None:
        """Get a single audit log entry by ID."""
        result = await self._session.scalars(
            select(AuditLog).where(AuditLog.id == audit_id)
        )
        return result.first()

    async def get_chain_entries_for_verification(
        self,
        start: int = 0,
        end: int | None = None,
    ) -> list[AuditLog]:
        """Get audit log entries for chain verification, ordered by creation (oldest first)."""
        stmt = select(AuditLog).order_by(AuditLog.created_at.asc()).offset(start)
        if end is not None:
            stmt = stmt.limit(end - start)
        result = await self._session.scalars(stmt)
        return list(result.all())
