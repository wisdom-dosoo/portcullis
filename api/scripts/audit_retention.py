#!/usr/bin/env python3
"""Prune audit rows older than AUDIT_RETENTION_DAYS and verify hash chains.

Usage:
  python scripts/audit_retention.py --prune     # delete expired rows
  python scripts/audit_retention.py --verify    # verify chains, exit 1 on break
  python scripts/audit_retention.py --prune --verify

Retention is per-tenant and uses the hash-chained `audit_log` table. Pruning
deletes from the OLD end; the oldest surviving row keeps its `prev_hash`
pointer (chain verification starts there). SOC 2 evidence must be exported
(`GET /v1/audit/export`) BEFORE pruning — the script refuses to prune when
retention is 0 (keep forever, the default).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import UTC, datetime, timedelta

sys.path.insert(0, ".")

from sqlalchemy import delete

from app.config import get_settings
from app.models.db import create_engine, create_session_factory
from app.models.orm import AuditLog


async def prune(retention_days: int) -> int:
    if retention_days <= 0:
        print("AUDIT_RETENTION_DAYS=0 — pruning disabled (keep forever).")
        return 0
    settings = get_settings()
    engine = create_engine(settings)
    factory = create_session_factory(engine)
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    async with factory() as session:
        result = await session.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
        await session.commit()
        total = result.rowcount or 0
    await engine.dispose()
    print(f"pruned {total} audit rows older than {cutoff.isoformat()}")
    return total


async def verify() -> bool:
    from sqlalchemy import select

    from app.repositories.audit import AuditRepository

    settings = get_settings()
    engine = create_engine(settings)
    factory = create_session_factory(engine)
    ok = True
    async with factory() as session:
        tenants = (await session.execute(select(AuditLog.tenant_id).distinct())).all()
        repo = AuditRepository(session)
        for (tid,) in tenants:
            valid, reason = await repo.verify_chain(tid)
            status = "OK" if valid else f"BROKEN: {reason}"
            print(f"tenant {tid}: {status}")
            ok = ok and valid
    await engine.dispose()
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prune", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if not args.prune and not args.verify:
        parser.print_help()
        return 2
    settings = get_settings()
    if args.prune:
        asyncio.run(prune(settings.audit_retention_days))
    if args.verify and not asyncio.run(verify()):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
