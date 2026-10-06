"""File-backed dead-letter spill for audit events.

Ship-checklist: `record_event` must never break requests, but silently
dropping audit rows on DB outage is a compliance hole. Failed events are
appended as JSONL to `audit_dlq_path` (best-effort, bounded) so they can be
replayed after recovery with `scripts/audit_dlq_replay.py`.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Bound a single spill write — a poison payload must not fill the disk.
MAX_DLQ_LINE_BYTES = 64 * 1024


def spill_to_dlq(path: str, event: dict[str, Any]) -> bool:
    """Append one event to the DLQ file. Returns True on success."""
    if not path:
        return False
    try:
        record = {
            **event,
            "dlq_spilled_at": datetime.now(UTC).isoformat(),
        }
        line = json.dumps(record, default=str)
        if len(line.encode()) > MAX_DLQ_LINE_BYTES:
            line = json.dumps(
                {**record, "detail": {"_truncated": "detail exceeded DLQ line cap"}},
                default=str,
            )
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        return True
    except Exception as exc:  # noqa: BLE001 - DLQ must never raise
        logger.error("audit.dlq_spill_failed", path=path, error=str(exc))
        return False
