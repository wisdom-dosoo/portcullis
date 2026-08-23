"""Anonymous self-host telemetry endpoint boundary.

  * ``POST /v1/telemetry/heartbeat`` — opt-in anonymous heartbeat from a
    self-hosted install.  Disabled by default (returns 404 so the surface
    doesn't leak when off); the operator turns it on via ``telemetry_enabled``
    to count active installs and build the self-host -> Cloud conversion
    funnel described in the Phase 4 strategy review.
  * ``GET /admin/telemetry/instances`` and ``GET /admin/telemetry/summary`` —
    platform-admin reads of the install records and aggregates.

The endpoint is deliberately unauthenticated: requiring credentials would
break the anonymity of self-host install reporting.  ``telemetry_enabled``
gating and the 404-when-off behaviour keep the surface inert by default, and
install rows are keyed on a self-chosen ``install_id`` so replay of the same
id cannot inflate the count.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import platform_admin_subject
from app.auth.subject import Subject
from app.config import Settings
from app.models.schemas import InstanceHeartbeatRequest, InstanceSummaryView, InstanceView
from app.repositories.instances import InstanceRepository

router = APIRouter(tags=["telemetry"])


def _require_enabled(settings: Settings) -> None:
    if not settings.telemetry_enabled:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/v1/telemetry/heartbeat", response_model=InstanceView)
async def heartbeat(
    payload: InstanceHeartbeatRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> InstanceView:
    """Record (or refresh) an anonymous self-host install heartbeat."""
    _require_enabled(settings)
    instance = await InstanceRepository(session).upsert_heartbeat(
        payload.install_id,
        version=payload.version,
        server_count=payload.server_count,
    )
    await session.commit()
    return InstanceView.model_validate(instance)


@router.get("/admin/telemetry/summary", response_model=InstanceSummaryView)
async def admin_telemetry_summary(
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> InstanceSummaryView:
    """Return aggregate install counts (platform admin only)."""
    counts = await InstanceRepository(session).counts()
    return InstanceSummaryView(**counts)


@router.get("/admin/telemetry/instances", response_model=list[InstanceView])
async def admin_telemetry_instances(
    _subject: Annotated[Subject, Depends(platform_admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[InstanceView]:
    """Return all known self-host installs, most recently seen first."""
    instances = await InstanceRepository(session).list_instances()
    return [InstanceView.model_validate(i) for i in instances]


__all__ = ["router"]