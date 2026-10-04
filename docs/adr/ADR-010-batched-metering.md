# ADR-010: Batched usage metering off the hot path

## Status
Accepted (P3)

## Context
Every proxied request committed 1-2 extra DB transactions (`record_usage` +
`verify_key:update_last_used`) on the request session — throughput bottleneck
plus fragile interleaved commits that perturbed auth/RBAC reads.

## Decision
Aggregate usage deltas in a process-wide `UsageQueue` (2s / 5000-event flush,
one ON CONFLICT upsert per tenant-day) via `record_usage_queued`; throttle
`last_used_at` to hourly. Queue-full/flush failures drop counters with a
warning (metering stays best-effort, proxying never blocks).

## Alternatives Considered
- **Redis counters + periodic reconciler**: fewer Postgres writes, but adds a
  second source of truth to reconcile on crashes.
- **Synchronous single upsert (P1)**: fixed the race but kept the per-request
  commit.

## Consequences
- Positive: proxy commits drop to zero for metering; usage survives request
  rollback via the queue's own sessions.
- Negative: per-second usage dashboards lag ~2s; crashes can lose the current
  batch.
