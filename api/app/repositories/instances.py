"""Self-host telemetry repository for anonymous install heartbeats."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Instance


class InstanceRepository:
    """Data access for anonymous self-host install records.

    The table is a per-install upsert keyed on the install's persistent
    ``install_id``: repeated heartbeats update the same row rather than
    creating unbounded history.  The caller commits the session.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_heartbeat(
        self,
        install_id: UUID,
        *,
        version: str,
        server_count: int,
        seen_at: datetime | None = None,
    ) -> Instance:
        """Record a heartbeat from the given install, creating or updating."""
        row = await self._session.scalar(select(Instance).where(Instance.install_id == install_id))
        now = seen_at or datetime.now(UTC)
        if row is None:
            row = Instance(
                install_id=install_id,
                version=version,
                server_count=server_count,
                first_seen_at=now,
                last_seen_at=now,
            )
            self._session.add(row)
            await self._session.flush()
            return row

        row.version = version
        row.server_count = server_count
        row.last_seen_at = now
        return row

    async def list_instances(self) -> list[Instance]:
        """Return all known installs, most recently seen first."""
        result = await self._session.scalars(
            select(Instance).order_by(Instance.last_seen_at.desc())
        )
        return list(result.all())

    async def counts(self) -> dict[str, int]:
        """Return aggregate install counts for the Phase 4 funnel review.

        ``total`` is the number of distinct installs ever seen;
        ``active`` is the count of installs reporting within the last 24h
        (a conservative active-install proxy for a heartbeat cadence).
        """
        total = await self._session.scalar(select(func.count()).select_from(Instance))
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        active = await self._session.scalar(
            select(func.count()).select_from(Instance).where(Instance.last_seen_at >= cutoff)
        )
        return {"total": int(total or 0), "active_24h": int(active or 0)}


__all__ = ["InstanceRepository"]
