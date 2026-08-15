#!/bin/sh
set -e

# Run Alembic migrations exactly once across a scaled deployment.
#
# Every replica runs this entrypoint concurrently; without coordination the
# replicas race to apply the same migration.  A Postgres advisory lock held on a
# dedicated connection serializes migration while alembic runs as a child
# process.  The second replica simply waits for the first to finish, then runs
# alembic again (a no-op because HEAD is already applied).
python - <<'PY'
import asyncio
import os
import sys

import asyncpg

LOCK_ID = 724286549  # arbitrary namespace for the portcullis migration lock


async def run() -> int:
    dsn = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    try:
        # Session-scoped lock: released automatically when conn closes.
        await conn.execute("SELECT pg_advisory_lock($1)", LOCK_ID)
        proc = await asyncio.create_subprocess_exec("alembic", "upgrade", "head")
        await proc.wait()
        return proc.returncode or 0
    finally:
        await conn.close()


raise SystemExit(asyncio.run(run()))
PY

exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 1