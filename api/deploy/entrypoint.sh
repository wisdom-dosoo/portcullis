#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${REDIS_URL:?REDIS_URL must be set}"
# P2: workers/timeouts/proxy-headers are env-configurable (were hardcoded).
# Keep default 1 worker: global prometheus_client registries undercount with
# multiple workers unless PROMETHEUS_MULTIPROC_DIR is configured.
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
UVICORN_TIMEOUT="${UVICORN_TIMEOUT_KEEP_ALIVE:-75}"

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

exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers "$UVICORN_WORKERS" --proxy-headers --forwarded-allow-ips '*' --timeout-keep-alive "$UVICORN_TIMEOUT"