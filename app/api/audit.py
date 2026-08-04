"""Audit query endpoint boundary."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import authenticated_subject
from app.auth.subject import Subject
from app.models.orm import AuditEventType
from app.models.schemas import AuditLogView
from app.repositories.audit import AuditRepository

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogView])
async def list_audit_logs(
    subject: Annotated[Subject, Depends(authenticated_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    event_type: Annotated[AuditEventType | None, Query()] = None,
    server_slug: Annotated[str | None, Query()] = None,
) -> list[AuditLogView]:
    """Return audit log entries for the current tenant.

    Any authenticated subject may query audit logs.
    Results are ordered by created_at descending (newest first).
    """
    repo = AuditRepository(session)
    logs = await repo.list(
        subject.tenant_id,
        limit=limit,
        offset=offset,
        event_type=event_type,
        server_slug=server_slug,
    )
    return [AuditLogView.model_validate(log) for log in logs]
