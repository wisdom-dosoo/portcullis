# Portcullis — Production Readiness Review (Coolify.io Model)

**Date:** 2025-08-23  
**Reviewer:** Senior Software Engineer / Open Source Expert Contributor  
**Scope:** Full codebase audit (API, web, infra, CI/CD, tests) against self-hosted PaaS operational maturity

---

## Executive Summary

Portcullis is an **MCP gateway** (not a PaaS). It's architecturally solid for v0.1–v0.3 scope but has **significant gaps** before it can be a production-grade, multi-tenant SaaS equivalent to Coolify's control plane. The core proxy pipeline works; the control-plane surface area (teams, billing, SSO, provisioning) is ~60% implemented with several blockers.

**Verdict:** ✅ **Strong proxy core** | ❌ **Not multi-tenant ready** | 🚧 **Control plane incomplete**

---

## ✅ What's Working (Production-Ready Core)

| Area | Status | Notes |
|------|--------|-------|
| **MCP Proxy Pipeline** | ✅ Complete | Auth → Registry → RBAC → Rate-limit → Forward → Audit; handles streaming + buffering correctly |
| **API Key Auth (Argon2id)** | ✅ Complete | Timing-safe, prefix+secret format, revocation, scopes |
| **JWT/OAuth 2.1 RS Mode** | ✅ Complete | JWKS caching, audience/issuer validation, scope extraction |
| **RBAC Engine** | ✅ Complete | Default-deny, glob patterns, specificity+priority ranking, deny-wins |
| **Rate Limiting** | ✅ Complete | Token-bucket & sliding-window via atomic Lua; per-subject/server/tool hierarchy |
| **Session Affinity** | ✅ Complete | `Mcp-Session-Id` ↔ (tenant, subject, server) in Redis with sliding TTL |
| **Health Checks + Circuit Breaker** | ✅ Complete | Periodic checks, consecutive failure threshold, status transitions |
| **Observability** | ✅ Complete | OTel tracing, Prometheus `/metrics`, async Postgres audit log |
| **Database Migrations** | ✅ Complete | Alembic with advisory-lock serialization in entrypoint |
| **Docker Multi-stage Build** | ✅ Complete | Non-root user, slim runtime, healthcheck |
| **Test Infrastructure** | ✅ Strong | Unit (property-based for RL), Integration (testcontainers), Contract, CI pipeline |
| **Config Validation** | ✅ Strong | Pydantic Settings v2, production guards (pepper, CORS) |

---

## 🚫 Critical Gaps for Production / Multi-Tenant SaaS

### 1. Multi-Tenancy Is Incomplete (Blocker for SaaS)

- **Current**: Single `DEFAULT_TENANT_ID` sentinel everywhere (`constants.py`)
- **Missing**: 
  - Tenant isolation in proxy path (router uses `DEFAULT_TENANT_ID` hardcoded)
  - Per-tenant rate-limit policy namespace (policies table has `tenant_id` but resolution ignores it)
  - Per-tenant RBAC scope (roles/bindings have `tenant_id` but proxy doesn't filter by it)
  - Tenant-aware API key issuance (CLI `bootstrap` creates keys in default tenant only)
- **Impact**: Cannot onboard multiple customers; all subjects share global namespace

### 2. No Horizontal Scaling Story

- **Stateless API layer** ✅ (FastAPI workers)
- **Stateful dependencies**: 
  - Redis (rate limits, sessions) — **single instance only**, no sentinel/cluster config
  - Postgres — single primary, no read replicas, no PgBouncer
  - JWKS cache — in-memory module global (`_jwks_cache`), **not shared across workers**
- **Missing**: 
  - Redis Cluster / Sentinel configuration
  - Distributed JWKS cache (Redis-backed)
  - Connection pooling tuning for multi-worker
  - Session affinity documentation for load balancers

### 3. Control Plane API Incomplete

| Feature | Status | Gap |
|---------|--------|-----|
| Server CRUD | ✅ | — |
| API Key CRUD | ✅ | — |
| Role/Permission CRUD | ✅ | — |
| Rate Limit Policy CRUD | ✅ | — |
| **Audit Log Query** | ⚠️ Partial | No pagination, no date-range optimization, no export |
| **Team/Org Management** | 🚧 Schema only | API routes exist but permission enforcement is dashboard-role based, not gateway-subject based |
| **License/Usage Enforcement** | 🚧 Opt-in only | `usage_enforcement_enabled` flag gates 402; no Stripe/billing integration |
| **SSO (OIDC)** | 🚧 Schema + routes | Login flow exists but no session management, no role mapping from IdP claims |
| **Invitation Flow** | 🚧 Schema + routes | Code hashing works but no email delivery integration |

### 4. MCP Protocol Compliance Gaps

| Spec Feature | Status | Gap |
|--------------|--------|-----|
| `tools/list` filtering | ✅ | Server-side filtering implemented |
| `tools/call` proxy | ✅ | — |
| `resources/*` | ❌ Not implemented | Read/list/subscribe not proxied |
| `prompts/*` | ❌ Not implemented | Not proxied |
| `logging/*` | ❌ Not implemented | Not proxied |
| `roots/*` | ❌ Not implemented | Not proxied |
| **Sampling** | ❌ Not implemented | `sampling/createMessage` not supported |
| **Streamable HTTP full spec** | ⚠️ Partial | GET for SSE works; `DELETE` for session termination not handled |
| **Origin validation** | ✅ Dev only | Production binds to `0.0.0.0` — needs configurable allow-list |

### 5. Security Hardening Missing

- **No WAF/rate-limit on management API** (only pre-auth IP-based on proxy)
- **No mTLS between gateway ↔ upstream** (only `service_token` header passthrough)
- **No request/response size limits on upstream** (only inbound)
- **No API key rotation/expiry policy** (keys live forever until revoked)
- **No audit log tamper-evidence** (append-only but no hash chaining)
- **No secrets scanning in CI for Docker image** (only `pip-audit` + `gitleaks` on source)

### 6. Operations / Day-2 Gaps

| Area | Missing |
|------|---------|
| **Backup/Restore** | No pg_dump automation, no Redis RDB/AOF policy, no point-in-time recovery |
| **Disaster Recovery** | No runbook, no RPO/RTO documented, no cross-region replication |
| **Log Aggregation** | Structured JSON logs but no Loki/Fluent Bit config, no log rotation |
| **Alerting** | Prometheus metrics exposed but no Alertmanager rules, no PagerDuty/Slack webhooks |
| **Capacity Planning** | No SLO dashboards, no load test results published, no autoscaling hints |
| **Upgrade Strategy** | Blue/green not documented; Alembic lock helps but no migration rollback test |

---

## 📋 Coolify.io Parity Checklist

| Coolify Feature | Portcullis Equivalent | Status |
|-----------------|----------------------|--------|
| **Git-based deploy** | N/A (Portcullis is the *target*, not the deployer) | — |
| **Docker Compose stack** | `deploy/docker-compose.yml` | ✅ |
| **Managed Postgres/Redis** | BYO (Docker or managed) | ✅ (flexible) |
| **Auto TLS (Let's Encrypt)** | Cloudflare in front (doc'd) | ⚠️ Manual |
| **Team/RBAC** | OrgMember + OrgMemberRole | 🚧 Dashboard only |
| **Resource limits** | Rate limits only | ❌ No CPU/mem quotas |
| **Backup schedules** | None | ❌ |
| **Monitoring dashboard** | `/metrics` + Grafana (manual) | ⚠️ |
| **Audit log UI** | API only | ❌ |
| **CLI** | `portcullis` (bootstrap, migrate) | ✅ Basic |
| **API for automation** | Full REST + OpenAPI | ✅ |
| **Multi-server fleet** | Single gateway instance | ❌ No cluster mode |
| **Plugin/extension system** | None | ❌ |

---

## 🎯 Prioritized Roadmap to "Production + Scaling"

### P0 — Must Fix Before Any Paid Customer (2–4 weeks)

1. **Multi-tenant proxy path** — Thread `tenant_id` from authenticated subject through router, RBAC repo, rate-limit repo, audit
2. **Redis HA** — Document/configure Sentinel or Cluster; add connection pool sizing
3. **JWKS cache → Redis** — Replace in-memory global with distributed cache (TTL + pubsub invalidation)
4. **Management API rate limiting** — Per-subject token bucket on `/v1/*` (separate from MCP proxy limits)
5. **mTLS upstream** — Add `ssl_ca`, `ssl_cert`, `ssl_key` to `McpServer`; configure `httpx` client per-server
6. **Origin header allow-list in production** — Config-driven, reject unknown origins

### P1 — Multi-Tenant SaaS MVP (4–6 weeks)

1. **Tenant provisioning API** — `POST /v1/tenants` with license issuance (already scaffolded in `provisioning.py`)
2. **Usage enforcement + billing webhook** — Stripe/Paddle integration; `usage_enforcement_enabled` → 402 with retry-after
3. **SSO completion** — Session cookies, role mapping from IdP `groups` claim, logout propagation
4. **Audit log UI + export** — Pagination, CSV/JSONL download, date-range, filter by subject/server
5. **Email delivery abstraction** — Pluggable (SendGrid, Resend, SMTP) for invitations, alerts

### P2 — Scale & Harden (6–10 weeks)

1. **Horizontal scaling guide** — Worker count, Redis cluster, PgBouncer, healthcheck tuning
2. **Full MCP spec support** — `resources/*`, `prompts/*`, `sampling/*`, `roots/*`, `DELETE /session`
3. **Admin dashboard (v0.3)** — Read-only React/Next.js UI for servers, roles, audit, usage
4. **Helm chart + K8s operator** — Deployment, HPA, PodDisruptionBudget, ServiceMonitor
5. **Backup/restore automation** — CronJob pg_dump + Redis RDB to S3/GCS; restore runbook
6. **Alerting rules** — PrometheusRule CRDs for: p99 latency, error rate, RL rejection rate, upstream health, disk/mem

### P3 — Platform Parity (10+ weeks)

1. **Resource quotas per tenant** — CPU/memory limits via K8s or cgroups (if bare metal)
2. **Plugin system** — Wasm or HTTP-based middleware for custom auth, transforms, logging
3. **Multi-region / Geo-routing** — Latency-based upstream selection, async replication
4. **SOC 2 audit log** — Immutable write-once storage (CloudTrail-style), retention policies
5. **SCIM provisioning** — Okta/Entra ID user/group sync to OrgMember

---

## 📊 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Single-tenant collision in prod** | High | Critical | Fix P0 #1 immediately |
| **Redis OOM under burst** | Medium | High | Configure `maxmemory-policy allkeys-lru`; monitor `used_memory` |
| **JWKS cache stale across workers** | High | Medium | P0 #3 |
| **Alembic migration deadlock at scale** | Low | High | Advisory lock works; test with 10+ replicas |
| **Upstream DoS via gateway** | Medium | High | Per-upstream circuit breaker + global inbound rate limit |
| **Audit log growth unbounded** | Medium | Medium | Partition by month; TTL + archive to S3 |
| **No rollback for failed migration** | Low | High | Test `alembic downgrade -1` in CI; snapshot DB before deploy |

---

## 🏁 Verdict: "Coolify-Ready"?

| Criterion | Pass? |
|-----------|-------|
| **Self-hostable in 1 command** | ✅ `docker compose up` |
| **Runs on bare metal / VM / K8s** | ✅ Docker image provided |
| **Bring-your-own Postgres/Redis** | ✅ Env-driven |
| **TLS termination at edge** | ✅ Cloudflare documented |
| **Multi-tenant isolation** | ❌ **Blocker** |
| **Horizontal scaling documented** | ❌ |
| **Day-2 ops (backup, alerting, DR)** | ❌ |
| **Extensible / plugin model** | ❌ |
| **Team dashboard for customers** | 🚧 v0.3 target |

**Bottom line**: Portcullis is a **well-architected MCP gateway core** (v0.1–v0.2 scope) but **not yet a multi-tenant control plane**. To reach Coolify-level "install and forget" for customers, prioritize **P0 multi-tenancy + Redis HA + mTLS**, then build the **tenant provisioning + billing + admin UI** loop. The foundation is clean — the gaps are almost entirely "control plane surface area," not proxy correctness.