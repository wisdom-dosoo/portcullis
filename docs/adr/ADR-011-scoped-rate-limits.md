# ADR-011: Scope-shared rate-limit buckets

## Status
Accepted (P3)

## Context
Every policy resolved to a `rl:{tenant}:{subject}:{server}:{tool}` key, so a
global policy was enforced N× (once per tool/path). Attackers spread calls
over tools to multiply their limit.

## Decision
`resolve_policy` returns a `scope` (tool/server/subject/global) and
`RateLimiter.check` keys by it: global policies share one bucket per
(tenant[, server]), subject policies per (tenant, subject), etc. Key segments
are sanitized and bounded (P2) regardless of scope.

## Alternatives Considered
- **Hierarchical checks (global AND per-tool)**: strongest, but doubles Redis
  round trips on the hot path; deferred until latency budget allows.
- **Keep per-tool keys**: preserves current behavior, keeps the bypass.

## Consequences
- Positive: global limits are actually global.
- Negative: one-time bucket-key reset on deploy (old per-tool buckets orphan
  and expire via TTL).
