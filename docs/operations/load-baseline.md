# Load baseline (ship-checklist)

SLOs are targets until measured. Run this baseline before launch, record the
numbers below, and size HPA/resources from data — not defaults.

## SLO targets (README §19)

| Metric | Target |
|---|---|
| p50 proxy overhead (gateway only, excl. upstream) | < 15 ms |
| p99 proxy overhead | < 75 ms |
| Rate-limiter check (single Redis round trip) | < 5 ms |
| Gateway availability (excl. upstream outages) | 99.9% |
| Audit write | at-least-once, never blocks response |

## How to run

```bash
cd api
export PORTCULLIS_API_KEY=pk_live_...   # proxy key bound to the test slug
export PORTCULLIS_SLUG=locust-smoke
locust -f locustfile.py --host http://localhost:8080 \
  --users 50 --spawn-rate 5 --run-time 10m --headless \
  --csv=load-baseline
```

For production-like numbers run against staging with 2 gateway replicas,
PgBouncer on, Redis sentinel, and a mock upstream with ~20 ms p50.

## Results log (fill in at launch, re-run quarterly)

| Date | Users | p50 overhead | p99 overhead | limiter p99 | 5xx % | Notes |
|------|-------|--------------|--------------|-------------|-------|-------|
| YYYY-MM-DD | 50 | _ms_ | _ms_ | _ms_ | _%_ | baseline |
| YYYY-MM-DD | 200 | _ms_ | _ms_ | _ms_ | _%_ | HPA scale check |

Overhead = `portcullis_request_duration_seconds` minus upstream time
(`portcullis_upstream_request_duration_seconds`). Limiter = Redis `EVALSHA`
round trip (see `app/limits/redis_bucket.py`).

## HPA guidance from the baseline

- If p99 > 75 ms before CPU hits 70%, raise `resources.limits.cpu` first —
  the gateway is event-loop bound, not memory bound.
- If 429s spike before latency does, limits (not capacity) are the ceiling —
  tune `rateLimitDefault` / per-tool policies, not replicas.
- Keep `UVICORN_WORKERS=1` per pod (Prometheus global registry undercounts
  with multiple workers). Scale pods, not workers.

## On-call routing

All `prometheusrules.yaml` alerts carry `severity` + `runbook_url`. Wire them:

```yaml
monitoring:
  alertRouting:
    enabled: true
    receiver: "pagerduty-portcullis"   # your Alertmanager receiver
    criticalRepeatInterval: 5m
    warningRepeatInterval: 30m
```

Critical pages: `PortcullisHighErrorRate`, `PortcullisUpstreamUnavailable`,
`PortcullisUpstreamUnhealthy`, `PortcullisAuditWriteFailing` (new).
Warning tickets: latency, RBAC/rate-limit spikes, Redis memory.
No receiver configured = alerts fire into the void — do not launch without one.
