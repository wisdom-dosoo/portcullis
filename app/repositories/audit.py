"""Audit log repository for persisting and querying audit records."""

from __future__ import annotations

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
    ) -> list[AuditLog]:
        """Return audit logs for the given tenant ordered by created_at DESC.

        Applies event_type and server_slug filters when provided.
        """
        stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if event_type is not None:
            stmt = stmt.where(AuditLog.event_type == event_type)
        if server_slug is not None:
            stmt = stmt.where(AuditLog.server_slug == server_slug)
        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        result = await self._session.scalars(stmt)
        return list(result.all())
