#!/usr/bin/env python3
"""Replay spilled audit DLQ lines back into Postgres after recovery.

Usage:
  python scripts/audit_dlq_replay.py [--dlq PATH] [--truncate]

Reads JSONL (see app/observability/audit_dlq.py), inserts each event via
AuditRepository (re-chained with fresh hashes), then truncates the file only
when --truncate is passed and every line replayed cleanly.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from uuid import UUID

sys.path.insert(0, ".")

from app.config import get_settings
from app.models.db import create_engine, create_session_factory
from app.models.orm import AuditEventType, SubjectType
from app.repositories.audit import AuditRepository


async def replay(path: str) -> int:
    settings = get_settings()
    engine = create_engine(settings)
    factory = create_session_factory(engine)
    count = 0
    async with factory() as session:
        repo = AuditRepository(session)
        with open(path, encoding="utf-8") as fh:  # noqa: ASYNC230 — offline replay, not hot path
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                event = json.loads(line)
                tenant = UUID(event["tenant_id"]) if event.get("tenant_id") else None
                st = SubjectType(event["subject_type"]) if event.get("subject_type") else None
                await repo.create(
                    event_type=AuditEventType(event["event_type"]),
                    outcome=event.get("outcome", "error"),
                    tenant_id=tenant,
                    subject_id=event.get("subject_id"),
                    subject_type=st,
                    server_slug=event.get("server_slug"),
                    tool_name=event.get("tool_name"),
                    rpc_method=event.get("rpc_method"),
                    client_ip=event.get("client_ip"),
                    request_id=event.get("request_id"),
                    detail=event.get("detail") or {},
                )
                count += 1
        await session.commit()
    await engine.dispose()
    print(f"replayed {count} DLQ events from {path}")
    return count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dlq", default=None)
    parser.add_argument("--truncate", action="store_true")
    args = parser.parse_args()
    path = args.dlq or get_settings().audit_dlq_path
    if not path:
        print("no DLQ path configured (AUDIT_DLQ_PATH empty)", file=sys.stderr)
        return 2
    total = asyncio.run(replay(path))
    if args.truncate and total > 0:
        open(path, "w", encoding="utf-8").close()
        print(f"truncated {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
