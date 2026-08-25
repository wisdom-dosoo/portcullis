# Portcullis — Reliability & System Architecture

**The promise this document has to keep: nothing in here is a paid feature.** High availability, backups, self-healing, monitoring, and disaster recovery all ship in the open-source repo, fully working, on day one. If "people can rely on it" only held true for paying customers, Portcullis would just be open-core with a friendlier README — the exact model `PRODUCT.md §1` already rejected. Portcullis Cloud's value is *operating* this tooling on someone's behalf, never owning tooling that self-hosters don't get.

This extends the SLO targets first stated in `README.md §19` into the actual system design that has to hold them up.

---

## Table of Contents

1. [Reliability Philosophy](#1-reliability-philosophy)
2. [Deployment Topologies](#2-deployment-topologies)
3. [High Availability Architecture](#3-high-availability-architecture)
4. [Data Durability & Backups](#4-data-durability--backups)
5. [Zero-Downtime Deployments & Migrations](#5-zero-downtime-deployments--migrations)
6. [Failure Modes & Graceful Degradation](#6-failure-modes--graceful-degradation)
7. [Self-Healing & Circuit Breaking](#7-self-healing--circuit-breaking)
8. [Observability for Operators](#8-observability-for-operators)
9. [Disaster Recovery Runbook](#9-disaster-recovery-runbook)
10. [Capacity Planning & Scaling Guidance](#10-capacity-planning--scaling-guidance)
11. [Chaos & Resilience Testing](#11-chaos--resilience-testing)
12. [What Portcullis Cloud Adds (and Doesn't)](#12-what-portcullis-cloud-adds-and-doesnt)

---

## 1. Reliability Philosophy

A gateway that's down is worse than no gateway — every registered MCP server becomes unreachable at once, not just degraded. That makes reliability the actual product, not a nice-to-have, and it's the reason this document exists as its own pillar alongside `README.md` and `PRODUCT.md` rather than a paragraph in a "future work" section.

Three commitments this whole document is written to satisfy:
1. **A self-hoster with zero budget can still run this safely in production** — HA, backups, and alerting are `docker-compose` profiles anyone can turn on, not sales conversations.
2. **Self-hosted instances never depend on Portcullis Cloud to function.** No phone-home, no license server, no "Cloud is down so your gateway degrades." If Cloud disappeared tomorrow, every self-hosted instance keeps working exactly as before.
3. **Every failure mode has a stated, deliberate behavior** — "we're not sure what happens if Redis dies" is not an acceptable answer for infrastructure other systems depend on, so §6 enumerates every dependency failure and the exact chosen response.

---

## 2. Deployment Topologies

| Topology | When to use it | What's different from the Quickstart in README §8.2 |
|---|---|---|
| **Single-instance** | Solo devs, small teams, <10 registered servers, an outage of a few minutes is tolerable | Exactly the `docker-compose.yml` already in the README — one app container, one Postgres, one Redis |
| **HA multi-instance** | Teams whose agents depend on the gateway for production traffic | N stateless app replicas behind a load balancer, Postgres primary+replica, Redis Sentinel — this document's subject |

Both topologies run the identical, unmodified Portcullis image. HA is a deployment choice, never a different build.

---

## 3. High Availability Architecture

```
                     ┌─────────────┐
        clients ───▶ │Load Balancer│  (health check: GET /healthz)
                     └──────┬──────┘
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │Portcullis│  │Portcullis│  │Portcullis│    ◀── stateless app replicas,
        │ replica 1│  │ replica 2│  │ replica 3│        any replica can serve any request
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             └──────────────┼──────────────┘
              ┌──────────────┴───────────────┐
              ▼                               ▼
     ┌─────────────────┐            ┌──────────────────┐
     │ Postgres primary │──streams──▶│ Postgres replica │   (control plane: durable)
     │  + replica(s)     │           │  (read fallback)  │
     └─────────────────┘            └──────────────────┘
              ┌───────────────────────────────┐
              ▼                                ▼
     ┌─────────────────┐            ┌──────────────────┐
     │  Redis (primary) │◀──sentinel▶│ Redis (replica)  │   (ephemeral: recoverable)
     └─────────────────┘            └──────────────────┘
```

- **App layer is stateless by design** — every piece of per-request state lives in Postgres or Redis (this is why `README.md ADR-006` insisted on async SQLAlchemy end-to-end: nothing about the app layer holds state that would make one replica special). Any replica can serve any request; the load balancer needs no session affinity.
- **Postgres carries the durable control plane** — servers, roles, permissions, audit log. A primary with at least one streaming replica; promote the replica on primary failure (via Patroni for self-managed HA, or a managed provider's built-in failover for those who'd rather not run Patroni themselves).
- **Redis carries only ephemeral state** — rate-limit counters, session mapping, registry cache. Redis Sentinel (3 nodes minimum) handles automatic primary failover. Losing a few seconds of Redis availability during failover is an accepted, bounded cost — see §6 for exactly what happens.
- **Rolling restarts are safe by construction** — the load balancer drains one replica, Portcullis finishes in-flight requests (graceful shutdown on `SIGTERM`, default 30s grace period), the replica restarts, traffic resumes. No coordination between replicas is required because none of them hold state the others don't have access to.

---

## 4. Data Durability & Backups

| What | Mechanism | Retention |
|---|---|---|
| Postgres | WAL archiving (continuous) + nightly `pg_dump` logical snapshot | 30 days of WAL + snapshots, configurable |
| Redis | AOF (append-only file) persistence, `appendfsync everysec` | Best-effort — see below |
| Backup verification | Scheduled job restores the latest snapshot into a throwaway database and runs a smoke query | Runs nightly, alerts on failure |

**Redis is deliberately treated as recoverable, not sacred.** Rate-limit buckets refilling from zero after a restart and sessions needing a reconnect are both acceptable, bounded inconveniences — nothing security-relevant lives only in Redis (RBAC and audit data are Postgres-only, per `README.md ADR-001`). This is why that ADR's choice to put control-plane data in Postgres and only ephemeral data in Redis matters here specifically: it means Redis's failure mode is "briefly annoying," never "silently insecure."

**"We have backups" is a claim, not a fact, until it's proven.** The verification job above exists because an unrestored backup is indistinguishable from no backup at all until the day you need it — this is the single most common way self-hosted reliability plans fail in practice, and it's why verification is scripted rather than left as a checklist item in a runbook nobody reads.

All of this — the WAL config, the backup service, the verification job — ships as a `docker-compose.ha.yml` profile in the open-source repo. It is not withheld for Cloud.

---

## 5. Zero-Downtime Deployments & Migrations

**Migrations run once, as a separate job, before new replicas take traffic** — never "every replica races to migrate on boot," which is a classic self-inflicted outage when two replicas start simultaneously and both try to run Alembic. The deploy sequence:

1. Run `alembic upgrade head` as a single one-off job against the primary.
2. Roll out new-version replicas one at a time behind the load balancer.
3. Drain and replace the previous-version replicas only after the new ones pass health checks.

**Schema changes follow the expand/contract pattern**, so old and new app versions can both run correctly during the rollout window:

```
Release N:   add new_column (nullable)          — old code ignores it, new code doesn't exist yet
Release N+1: deploy code that WRITES both old_column and new_column
Release N+2: backfill new_column for existing rows
Release N+3: deploy code that reads ONLY new_column
Release N+4: drop old_column
```

Skipping straight to "rename a column and deploy" is exactly what breaks a rolling deploy — the moment one replica is on the new version and another isn't, one of them is querying a column that no longer matches what it expects.

---

## 6. Failure Modes & Graceful Degradation

Every dependency failure gets a stated, deliberate answer — not a shrug:

| Dependency down | Behavior | Why |
|---|---|---|
| **Redis** | Rate limiter **fails open** (requests proceed, denial logged as a warning, `portcullis_ratelimit_backend_down_total` metric incremented); session routing degrades to stateless round-robin; RBAC is **unaffected** | Postgres, not Redis, is RBAC's source of truth (Redis only caches it) — so the one dependency that's allowed to fail open is exactly the one with no security consequence when it does |
| **Postgres** | **Fails closed, entirely** — no registry lookups, no RBAC decisions, no audit writes, `/healthz` goes red | Default-deny RBAC (`README.md §11.3`) cannot guess a permission it can't read; guessing "allow" here would be a real security hole, so this is the one dependency that must never fail open |
| **A single upstream MCP server** | Circuit breaker opens for *that server only* (`README.md §5.2`); other servers continue normally; callers get `-32004` | Isolating the blast radius to one upstream is the entire point of a gateway — one bad server should never take down the others |
| **A single Portcullis app replica** | Load balancer routes around it; in-flight requests on that replica get their normal timeout | Stateless replicas mean losing one is a capacity event, not an outage |
| **Portcullis Cloud's control plane** (Cloud customers only) | **Zero effect on the customer's running instance** — it keeps serving traffic exactly as before | This is the guarantee stated in §1: self-hosted (and Cloud-provisioned) instances never phone home to function |

---

## 7. Self-Healing & Circuit Breaking

Extends the circuit breaker introduced in `README.md §5.2` with the actual state machine:

- **Closed** (normal) → after N consecutive health-check failures (default 3) → **Open** (requests to that server fail fast with `-32004`, no time wasted on a doomed request)
- **Open** → after a cooldown period → **Half-open** (a single trial request is allowed through)
- **Half-open** → success → **Closed**; failure → back to **Open** with **exponential backoff + jitter** on the next cooldown, so a flapping upstream doesn't get hammered with synchronized retries the moment it flickers back

This state machine lives per-server, in Redis (ephemeral, consistent with §6 — a Redis blip resets circuit state to closed, which is an acceptable, self-correcting default, not a security concern).

---

## 8. Observability for Operators

Shipped as `docker-compose.observability.yml`, free, in the open-source repo — turning `README.md §13`'s tracing/metrics primitives into something an operator can actually look at without building their own Grafana instance from scratch:

- **Prometheus** scraping `/metrics` (already exposed per `README.md §13.2`)
- **Grafana**, pre-loaded with dashboards for: server health/latency, RBAC denial rate, rate-limit headroom, replica count and resource usage
- **Alertmanager**, pre-loaded with alert rules for the failure modes in §6: an upstream open-circuit for >5 minutes, Postgres replication lag, Redis backend-down rate spikes, disk usage on the Postgres volume

A self-hoster who runs `docker compose -f docker-compose.yml -f docker-compose.observability.yml up` gets working dashboards and working alerts immediately — not a blank Grafana instance and a weekend of dashboard-building. That gap (a monitoring stack that's technically available vs. one that's actually configured for *this* system) is exactly the kind of thing that quietly gets left for a paid tier elsewhere; here it doesn't, on purpose.

---

## 9. Disaster Recovery Runbook

**Targets** (targets to build toward and test against, consistent with the epistemic honesty already established in `README.md §19` — not measured guarantees):

| Metric | Target |
|---|---|
| RPO (Recovery Point Objective) — max acceptable data loss | < 5 minutes (bounded by WAL archiving frequency) |
| RTO (Recovery Time Objective) — max acceptable downtime | < 30 minutes for a full restore from backup |

**Restore runbook:**
1. Provision a fresh Postgres instance.
2. Restore the latest verified `pg_dump` snapshot.
3. Replay WAL archives from the snapshot point forward to the desired recovery point.
4. Point a single Portcullis replica at the restored database; run `alembic upgrade head` if the backup predates the current schema version.
5. Verify via `/healthz` and a manual `GET /v1/servers` before restoring full traffic.
6. Scale back up to normal replica count.

**Run this drill quarterly, on purpose, against a real restore — not a tabletop exercise.** A DR runbook nobody has actually executed is a hypothesis, not a plan; the only way to know step 3 actually works is to have done it.

---

## 10. Capacity Planning & Scaling Guidance

Directional guidance, not benchmark claims (no fabricated throughput numbers — validate these with the load-testing approach in `README.md §16` against your own hardware before trusting them):

- **The two operations to watch are a Redis round trip per rate-limit check and a Postgres write per audit-log entry** — both `README.md §12` and `§13.3` already made these async/fire-and-forget for exactly this reason, so neither should be the bottleneck under normal load.
- **Scale the stateless app layer horizontally first** — adding replicas is cheaper and safer than vertically resizing a single instance, and it's the layer with no coordination cost (§3).
- **Watch Postgres connection count before CPU** — an async app under load is far more likely to exhaust the connection pool than to saturate a CPU core; size `DATABASE_URL` pool settings deliberately rather than leaving framework defaults in place.
- **Redis Sentinel failover, not Redis throughput, is usually the real limit** for rate-limiting at scale — the Lua script itself is O(1); the constraint is how fast Sentinel can promote a replica during a primary failure, which is a topology tuning question, not a code one.

---

## 11. Chaos & Resilience Testing

The failure-mode table in §6 is a set of claims. Claims about infrastructure behavior need to be tested the same way the rate limiter's correctness is tested with Hypothesis in `README.md §16` — by actually breaking things, on purpose, in CI:

- A `chaos/` test suite using **Toxiproxy** (or an equivalent fault-injection proxy) sits in front of the test Postgres and Redis instances used in the integration test tier.
- Scenarios: kill Redis mid-request and assert the rate limiter fails open (not closed, not crashed); kill Postgres and assert every endpoint returns a clean `-32603`/`503` rather than hanging or leaking a stack trace; inject 2-second latency on an upstream and assert the circuit breaker opens within the configured threshold.
- These run on a schedule (nightly), not on every PR — they're slower and noisier than the unit/integration tiers, but their entire purpose is catching the gap between "the failure-mode table says X" and "the code actually does X."

---

## 12. What Portcullis Cloud Adds (and Doesn't)

Stated explicitly, so this document can't quietly drift into justifying a paywall later:

| Capability | Self-hosted (free, forever) | Portcullis Cloud |
|---|---|---|
| HA topology, compose files, Sentinel/replica config | ✅ Included | ✅ Same, pre-configured |
| Backup + verification tooling | ✅ Included | ✅ Same tooling — **we run it for you** |
| Grafana dashboards + alert rules | ✅ Included | ✅ Same dashboards — **we watch them at 3am** |
| DR runbook | ✅ Included, documented above | ✅ Same runbook — **we execute it** |
| Chaos test suite | ✅ Included in the repo | ✅ Same suite, run against our infra continuously |
| Actually staffing an on-call rotation | ❌ That's you | ✅ That's the product |

Every row in the left column is real, working, and free — because a "reliable" self-hosted product that quietly isn't reliable unless you pay would make every claim earlier in this document dishonest. The only thing Cloud sells is not having to be the one who gets paged.

---

## Appendices

### A. Glossary of Failure Terms

| Term | Definition |
|---|---|
| **Fail open** | A security-critical component permits traffic through when it cannot verify integrity or authenticity — chosen deliberately for Redis rate limiter (no security consequence) but never for RBAC data (Postgres) |
| **Fail closed** | A security-critical component denies traffic when it cannot verify integrity or authenticity — chosen deliberately for Postgres RBAC data |
| **Circuit breaker** | A state machine that trips after N consecutive failures and recovers via a half-open trial request, preventing hammering of a flapping upstream |
| **RPO** | Recovery Point Objective — the maximum age of data that might be lost in a failure |
| **RTO** | Recovery Time Objective — the maximum time to restore service after a failure |

### B. HA Topology Quickstart

```yaml
# docker-compose.ha.yml (shipped in the repo)
services:
  portcullis:
    image: portcullis/portcullis:latest
    command: >
      uvicorn app.main:app
      --host 0.0.0.0 --port 8080
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file: .env
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: portcullis
      POSTGRES_PASSWORD: portcullis
      POSTGRES_DB: portcullis
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD pg_isready -U portcullis"]
      interval: 10s
      timeout: 5s
      retries: 5
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --appendfsync everysec
    volumes: ["redisdata:/data"]
    healthcheck:
      test: ["CMD redis-cli ping"]
      interval: 10s
      timeout: 5s
      retries: 5
  sentinel:
    image: redis:7-alpine
    command: redis-sentinel --sentinel-enabled yes --sentinel-down-after-milliseconds 30 --sentinel-failover-timeout 60
    volumes: ["sentineldata:/data"]
    healthcheck:
      test: ["CMD redis-cli -p 26379 sentinel quorum 2"]
      interval: 10s
      timeout: 5s
      retries: 5
  jaeger:
    image: jaegertracing/all-in-one:1.57
    ports: ["16686:16686"]
  prometheus:
    image: prom/prometheus:v2.45
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports: ["9090:9090"]
  alertmanager:
    image: prom/alertmanager:v0.27
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    ports: ["9093:9093"]
  grafana:
    image: grafana/grafana:10.4
    volumes:
      - ./grafana/dashboards:/etc/grafana/dashboards:ro
      - ./grafana/datasources:/etc/grafana/datasources:ro
    ports: ["3000:3000"]
volumes:
  pgdata:
  redisdata:
  sentineldata:
```

### C. Annual DR Drill Checklist

- [ ] Provision fresh Postgres instance
- [ ] Restore latest verified `pg_dump` snapshot
- [ ] Replay WAL archives to desired recovery point
- [ ] Run `alembic upgrade head` if schema mismatch
- [ ] Verify `/healthz` returns 200
- [ ] Manual `GET /v1/servers` check
- [ ] Scale back to normal replica count
- [ ] Document RPO/RTO observed (target: <5min RPO, <30min RTO)
- [ ] Post-mortem notes on any deviations