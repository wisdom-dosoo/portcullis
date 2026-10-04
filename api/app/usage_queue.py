"""Best-effort batched usage metering (P3).

The proxy hot path previously committed 1-2 extra DB transactions per proxied
request (`record_usage` + `verify_key:update_last_used`). This module aggregates
usage counters in memory and flushes them every `flush_interval_seconds` (or
`max_batch` events) with one ON CONFLICT upsert per (tenant, day).

Fail-closed is wrong here: metering must never break proxying, so a full queue
or flush error drops counters with a warning (existing `record_usage`
best-effort contract preserved).
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class _Bucket:
    requests: int = 0
    tool_calls: int = 0
    rbac_denials: int = 0
    rate_limit_rejections: int = 0


class UsageQueue:
    """Process-wide aggregated usage flusher."""

    def __init__(
        self,
        flush_interval_seconds: float = 2.0,
        max_batch: int = 5000,
        queue_size: int = 20000,
    ) -> None:
        self._flush_interval = flush_interval_seconds
        self._max_batch = max_batch
        self._queue: asyncio.Queue[tuple[UUID, date, _Bucket] | None] = asyncio.Queue(
            maxsize=queue_size
        )
        self._task: asyncio.Task[None] | None = None
        self._session_factory = None
        self._dropped = 0

    def start(self, session_factory) -> None:
        """Start the background flush loop (idempotent)."""
        if self._task is not None and not self._task.done():
            return
        self._session_factory = session_factory
        self._task = asyncio.create_task(self._flush_loop())

    async def stop(self) -> None:
        """Stop the loop after draining what is already queued."""
        if self._task is None:
            return
        await self._queue.put(None)
        await self._task
        self._task = None

    def enqueue(
        self,
        tenant_id: UUID,
        *,
        requests: int = 0,
        tool_calls: int = 0,
        rbac_denials: int = 0,
        rate_limit_rejections: int = 0,
        day: date | None = None,
    ) -> bool:
        """Enqueue one usage delta without blocking. False when dropped."""
        try:
            self._queue.put_nowait(
                (
                    tenant_id,
                    day or datetime.now(UTC).date(),
                    _Bucket(requests, tool_calls, rbac_denials, rate_limit_rejections),
                )
            )
            return True
        except asyncio.QueueFull:
            self._dropped += 1
            if self._dropped == 1 or self._dropped % 1000 == 0:
                logger.warning("usage.queue_full_dropping", dropped=self._dropped)
            return False

    async def _flush_loop(self) -> None:
        while True:
            batch: list[tuple[UUID, date, _Bucket]] = []
            try:
                first = await self._queue.get()
            except asyncio.CancelledError:
                return
            if first is None:
                return
            batch.append(first)
            while len(batch) < self._max_batch:
                try:
                    item = self._queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                if item is None:
                    await self._flush(batch)
                    return
                batch.append(item)
            # Wait a beat to coalesce bursts before flushing.
            try:
                await asyncio.sleep(self._flush_interval)
                while len(batch) < self._max_batch:
                    try:
                        item = self._queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                    if item is None:
                        await self._flush(batch)
                        return
                    batch.append(item)
            except asyncio.CancelledError:
                await self._flush(batch)
                return
            await self._flush(batch)

    async def _flush(self, batch: list[tuple[UUID, date, _Bucket]]) -> None:
        if not batch or self._session_factory is None:
            return
        aggregated: dict[tuple[UUID, date], _Bucket] = defaultdict(_Bucket)
        for tenant_id, day, bucket in batch:
            agg = aggregated[(tenant_id, day)]
            agg.requests += bucket.requests
            agg.tool_calls += bucket.tool_calls
            agg.rbac_denials += bucket.rbac_denials
            agg.rate_limit_rejections += bucket.rate_limit_rejections
        try:
            from app.repositories.usage import UsageRepository

            async with self._session_factory() as session:
                repo = UsageRepository(session)
                for (tenant_id, day), agg in aggregated.items():
                    await repo.increment(
                        tenant_id,
                        requests=agg.requests,
                        tool_calls=agg.tool_calls,
                        rbac_denials=agg.rbac_denials,
                        rate_limit_rejections=agg.rate_limit_rejections,
                        day=day,
                    )
                await session.commit()
        except Exception:  # noqa: BLE001 - metering must never break the proxy
            logger.warning("usage.queue_flush_failed", batch_size=len(batch))


_QUEUE: UsageQueue | None = None


def get_usage_queue() -> UsageQueue:
    """Return the process-wide usage queue (created on first use)."""
    global _QUEUE
    if _QUEUE is None:
        _QUEUE = UsageQueue()
    return _QUEUE
