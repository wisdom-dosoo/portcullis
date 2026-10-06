#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${REDIS_URL:?REDIS_URL must be set}"
# P2: workers/timeouts/proxy-headers are env-configurable (were hardcoded).
# Keep default 1 worker: global prometheus_client registries undercount with
# multiple workers unless PROMETHEUS_MULTIPROC_DIR is configured.
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
UVICORN_TIMEOUT="${UVICORN_TIMEOUT_KEEP_ALIVE:-75}"
# Ship-checklist: never trust all proxies by default. Empty (dev) = no
# --forwarded-allow-ips flag (uvicorn trusts nothing); production sets
# FORWARDED_ALLOW_IPS to ingress/LB CIDRs via ConfigMap (see config.py).
FORWARDED_ALLOW_IPS="${FORWARDED_ALLOW_IPS:-}"
# Ship-checklist: PgBouncer transaction mode cannot hold pg_advisory_lock.
# Set SKIP_MIGRATIONS=1 on app replicas and run the migrate Job instead
# (see deploy/k8s/helm/portcullis/templates/migrate-job.yaml).
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"

# Run Alembic migrations exactly once across a scaled deployment.
#
# Every replica runs this entrypoint concurrently; without coordination the
# replicas race to apply the same migration.  A Postgres advisory lock held on a
# dedicated connection serializes migration while alembic runs as a child
# process.  The second replica simply waits for the first to finish, then runs
# alembic again (a no-op because HEAD is already applied).
#
# Ship-checklist: with PgBouncer in transaction mode the advisory lock cannot
# be held (session-scoped). Production sets SKIP_MIGRATIONS=1 on the Deployment
# and runs templates/migrate-job.yaml against DATABASE_URL_DIRECT instead.
if [ "$SKIP_MIGRATIONS" = "1" ]; then
  echo "SKIP_MIGRATIONS=1 — skipping in-pod Alembic (migrate Job owns schema)"
else
  echo "Running Alembic migrations (advisory-locked, direct-DB URL required)"
  MIGRATION_DSN="${DATABASE_URL_DIRECT:-$DATABASE_URL}"
  export MIGRATION_DSN
  python - <<'PY'
import asyncio
import os

import asyncpg

LOCK_ID = 724286549  # arbitrary namespace for the portcullis migration lock


async def run() -> int:
    dsn = os.environ["MIGRATION_DSN"].replace("postgresql+asyncpg://", "postgresql://")
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
fi

if [ -n "$FORWARDED_ALLOW_IPS" ]; then
  # shellcheck disable=SC2086
  exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers "$UVICORN_WORKERS" --proxy-headers --forwarded-allow-ips "$FORWARDED_ALLOW_IPS" --timeout-keep-alive "$UVICORN_TIMEOUT"
else
  exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers "$UVICORN_WORKERS" --timeout-keep-alive "$UVICORN_TIMEOUT"
fi