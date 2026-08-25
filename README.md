# Portcullis

A high-performance, multi-tenant MCP gateway — one authenticated, observable, rate-limited entry point in front of every MCP server your organization runs.

<a href="https://github.com/wisdom-dosoo/portcullis">
  <img src="https://img.shields.io/badge/python-3.12-blue" alt="Python 3.12">
</img>
<a href="https://fastapi.tiangolo.com">
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688" alt="FastAPI">
</img>
<a href="https://opensource.org/licenses/Apache-2.0">
  <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License">
</img>
<a href="https://github.com/wisdom-dosoo/portcullis/actions">
  <img src="https://img.shields.io/github/actions/workflow/status/wisdom-dosoo/portcullis/ci.yml?branch=main" alt="CI">
</img>
<a href="https://github.com/wisdom-dosoo/portcullis/blob/main/LICENSE">
  <img src="https://img.shields.io/github/last-commit/wisdom-dosoo/portcullis" alt="Last commit">
</img>

---

## Why This Exists

Portcullis exists because organizations running more than one Model Context Protocol (MCP) server face three immediate, urgent problems:

- **No central auth.** Each MCP server either trusts the network it's reachable from, or ships with no auth at all — acceptable for a laptop, not for a shared environment.
- **No unified authorization.** There is no single place to say *"the on-call agent may call `deploy_rollback` but not `deploy_delete_environment.`"
- **No observability trail.** When something goes wrong, there is no audit trail answering *"which subject invoked which tool, on which server, and what did it return."*
- **No centralized rate limiting.** A misbehaving or compromised agent can hammer an upstream server with no backpressure, because rate limiting — if it exists — lives independently in each server, not centrally.

Portcullis applies the same architectural pattern as an API gateway (Kong, Envoy, Apigee) — but specifically to MCP's JSON-RPC-over-Streamable-HTTP traffic, with first-class understanding of MCP concepts (`tools/list`, `tools/call`, sessions) rather than treating it as opaque HTTP.

---

## What It Does

Portcullis is a control-plane and data-plane proxy that sits in front of one or more MCP servers. AI agents and MCP clients (Claude, Cursor, custom LangGraph/agent runtimes, etc.) talk to a single Portcullis endpoint; Portcullis handles authentication, per-tool authorization, rate limiting, distributed tracing, and audit logging, then forwards the JSON-RPC request to the correct upstream MCP server over Streamable HTTP.

**If you run more than one internal MCP server, you have already hit the problem Portcullis exists to solve.**

### Key Features

- **Multi-server registry** — register, health-check, enable/disable upstream MCP servers via a REST management API; no config-file redeploys needed to add a server.
- **Pluggable authentication** — OAuth 2.1 bearer tokens validated against any OIDC-compliant IdP's JWKS endpoint, or gateway-issued API keys for simpler service-to-service use.
- **Per-tool RBAC with default-deny** — roles bind to subjects (an OAuth `sub` or an API key), and permissions are glob patterns evaluated against `{server, tool_name}`. Nothing is reachable unless explicitly allowed.
- **Distributed rate limiting** — Redis-backed, Lua-script atomic, configurable per subject / per server / per tool, with standards-shaped `RateLimit-*` response headers.
- **Full observability** — an OpenTelemetry span for every proxied call (spanning gateway → upstream), Prometheus metrics at `/metrics`, and a structured, queryable Postgres audit log.
- **Streamable HTTP session management** — tracks `Mcp-Session-Id` to upstream-server mapping in Redis so reconnects and multi-turn sessions route consistently.
- **Circuit breaking & health checks** — an upstream marked unhealthy is taken out of rotation and callers get a clear `-32004` error instead of a hanging request.
- **Zero vendor lock-in** — plain Docker image; runs on Railway, Render, Fly.io, or bare-metal behind Cloudflare.

### Non-Goals

Stating these explicitly avoids scope creep and sets correct expectations for contributors:

- **Portcullis is not an OAuth 2.1 Authorization Server.** It is a *Resource Server* — it validates tokens issued elsewhere. If you need a full identity provider, pair Portcullis with an existing IdP (Auth0, Keycloak, Zitadel) or the companion project `keyforge`.
- **Portcullis does not implement MCP servers.** It proxies to them. Use the `mcp-forge` companion project (or hand-written FastMCP servers) to build the servers Portcullis sits in front of.
- **Portcullis does not do LLM inference, prompt management, or agent orchestration.** It is infrastructure, not an agent framework.
- **Portcullis is not a general-purpose API gateway.** It is intentionally scoped to MCP's JSON-RPC/Streamable-HTTP traffic; use Kong/Envoy/Cloudflare in front of unrelated REST/GraphQL services.

---

## Architecture

### High-Level Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │                 Portcullis                   │
                          │                                               │
   MCP Client ──HTTP──▶   │  Auth Middleware ─▶ RBAC Engine ─▶ Rate Limiter│──▶ Streamable HTTP ──▶ Upstream MCP Server A
  (Claude/Cursor/         │        │                 │             │      │                        (github-mcp)
   custom agent)          │        │                 │             ▼      │
                          │   JWKS / API-key    Postgres        Redis      │──▶ Streamable HTTP ──▶ Upstream MCP Server B
                          │      validation    (roles, perms)  (buckets,   │                        (postgres-mcp)
                          │        │                                       sessions)   │
                          │        ▼                                       │──▶ Streamable HTTP ──▶ Upstream MCP Server C
                          │  OpenTelemetry span + Prometheus + Audit Log   │                        (internal deploy-mcp)
                          └─────────────────────────────────────────────┘
                                        │
                                        ▼
                          Postgres (control plane: servers, roles,
                                    permissions, audit log)
```

### Component Breakdown

| Component | Responsibility |
|---|---|
| **API layer** (FastAPI app) | Terminates HTTP, exposes the management REST API and the `/mcp/{server_slug}` proxy endpoint |
| **Auth middleware** | Validates OAuth 2.1 bearer JWTs against configured JWKS, or hashed API keys against Postgres; resolves a `Subject` |
| **RBAC engine** | Given `(subject, server_slug, tool_name)`, evaluates role bindings + tool permission rules (default-deny) |
| **Registry service** | CRUD for upstream server records; periodic health checks; short-TTL Redis cache to avoid a DB hit per request |
| **Proxy/router** | Rewrites and forwards the JSON-RPC envelope to the upstream over Streamable HTTP; filters `tools/list` responses per RBAC before returning them |
| **Rate limiter** | Redis + Lua token-bucket / sliding-window implementation; atomic increment-and-check in a single round trip |
| **Session manager** | Maps `Mcp-Session-Id` → `(server_id, subject_id)` in Redis with a sliding TTL |
| **Observability layer** | OpenTelemetry span per request (`mcp.tools.call`, `mcp.tools.list`, …), Prometheus counters/histograms, async write to the Postgres audit log |
| **Postgres** | System of record: tenants, servers, API keys, roles, role bindings, tool permissions, audit log |
| **Redis** | Ephemeral/high-frequency state: rate-limit counters, session map, registry cache |

### Request Lifecycle — `tools/call`

```
Client               Portcullis                              Upstream MCP Server      Postgres / Redis
  │  POST /mcp/{slug}     │                                            │                     │
  │  {jsonrpc, tools/call}│                                            │                     │
  │──────────────────────▶│                                            │                     │
  │                       │─ validate bearer / API key ───────────────────────────────────▶  │
  │                       │◀─────────────────────── subject resolved ─────────────────────────│
  │                       │─ RBAC check(subject, slug, tool) ─────────────────────────────▶   │
  │                       │◀──────────────────────────── allow ────────────────────────────── │
  │                       │─ rate limit check (Redis Lua, atomic) ────────────────────────▶   │
  │                       │◀──────────────────────────── allow, remaining=42 ──────────────────│
  │                       │─ open OTel span "mcp.tools.call" ─────│                     │
  │                       │─ forward JSON-RPC (Streamable HTTP) ─────▶│                     │
  │                       │                                            │─ execute tool       │
  │                       │◀──────────────── JSON-RPC result ──────────│                     │
  │                       │─ write audit_log row (fire-and-forget) ───────────────────────▶   │
  │◀── JSON-RPC response ─│                                            │                     │
```

A denied request (RBAC or rate limit) **never reaches the upstream** — it is rejected at the gateway with a JSON-RPC error object, and the denial itself is still written to the audit log.

### Session & Transport Handling

- **Primary transport supported: Streamable HTTP** (per MCP best practice: stdio is single-client/local-only and cannot be meaningfully proxied to multiple concurrent agents; Streamable HTTP is the only transport that fits a shared gateway).
- On the first request in a session, Portcullis issues an `Mcp-Session-Id` and stores `{server_id, subject_id, created_at}` in Redis with a sliding TTL (`SESSION_TTL_SECONDS`, default 3600s).
- Subsequent requests carrying that session ID are routed to the same upstream instance where the upstream itself is stateful; this matters for upstream servers that hold in-memory context per session.
- **stdio upstreams** can still be wrapped via a small local bridge process (`stdio → Streamable HTTP`) that Portcullis treats as just another upstream URL — this is documented as an advanced/optional adapter, not core scope.
- Per MCP security guidance, Portcullis validates the `Origin` header on all incoming connections and, in local/dev mode, binds to `127.0.0.1` rather than `0.0.0.0` to mitigate DNS-rebinding attacks against the management API.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | **Python 3.12** | Async performance improvements, match statement, first-class typing |
| Web framework | **FastAPI 0.115+** | Native async, Pydantic v2 integration, automatic OpenAPI docs |
| Validation | **Pydantic v2** | Fast, typed request/response models; shared between REST and internal schemas |
| ORM / DB access | **SQLAlchemy 2.0 (async) + asyncpg** | Async end-to-end so the event loop is never blocked by DB I/O |
| Migrations | **Alembic** | Versioned, reviewable schema changes |
| Primary datastore | **PostgreSQL 16** | ACID guarantees for RBAC/audit data where correctness matters more than raw throughput |
| Cache / ephemeral state | **Redis 7** | Atomic Lua scripting for rate limiting; TTL-native for sessions and registry cache |
| MCP client | **FastMCP client / MCP Python SDK** | Official/community-standard client for speaking Streamable HTTP to upstreams |
| AuthN | **Authlib** (JWT/JWKS validation) | Mature OAuth 2.1 / OIDC primitives; avoids hand-rolled token validation |
| Password/API-key hashing | **argon2-cffi** | Memory-hard hashing for API key secrets |
| HTTP client (to upstreams) | **httpx (async)** | Async, HTTP/2-capable, used by both the proxy and the health checker |
| Observability | **OpenTelemetry SDK + OTLP exporter, prometheus-client, structlog** | Traces + metrics + structured logs, exportable to any OTLP-compatible backend |
| Testing | **pytest, pytest-asyncio, pytest-cov, hypothesis, testcontainers-python** | Async-first testing with real Postgres/Redis via containers |
| Lint / type check | **ruff, mypy** | Single fast linter+formatter, strict static typing on the control-plane code |
| Packaging | **hatch / pyproject.toml** | Modern, PEP 621-compliant packaging |
| Containerization | **Docker, docker-compose** | Local parity with production; multi-stage build for a slim runtime image |
| CI/CD | **GitHub Actions** | Lint → test (with service containers) → security scan → build → publish → deploy |
| Hosted deployment | **Railway** (primary demo), self-host via Docker elsewhere | Managed Postgres + Redis, simplest path to a stateful long-running service |
| Edge | **Cloudflare** (in front of the public endpoint) | TLS termination, DDoS protection, WAF rules on the management API |

---

## Repository Structure

```
portcullis/
├ app/
│   ├── main.py                     # FastAPI app factory, router mounting, lifespan
│   ├── config.py                   # Pydantic Settings (env-driven configuration)
│   │
│   ├── gateway/
│   │   ├── registry.py             # Upstream server CRUD + health checks + Redis cache
│   │   ├── proxy.py                # JSON-RPC forwarding over Streamable HTTP
│   │   ├── router.py               # Routes /mcp/{slug} to the right upstream
│   │   └── session.py              # Mcp-Session-Id ↔ upstream mapping (Redis)
│   │
│   ├── auth/
│   │   ├── jwt_validator.py        # JWKS fetch/cache + JWT verification (OAuth 2.1 RS mode)
│   │   ├── api_keys.py             # API key hashing, issuance, revocation
│   │   ├── rbac.py                 # Role/permission resolution and matching engine
│   │   └── dependencies.py         # FastAPI Depends() wiring auth into routes
│   │
│   ├── limits/
│   │   ├── redis_bucket.py         # Token-bucket / sliding-window Lua scripts
│   │   └── policies.py             # Resolves effective limit per subject/server/tool
│   │
│   ├── observability/
│   │   ├── otel.py                 # Tracer/provider setup, span helpers
│   │   ├── metrics.py              # Prometheus counters/histograms, /metrics route
│   │   └── audit.py                # Async audit log writer
│   │
│   ├── models/
│   │   ├── db.py                   # SQLAlchemy async engine/session factory
│   │   ├── orm.py                  # ORM models (tenants, servers, roles, …)
│   │   └── schemas.py              # Pydantic request/response models
│   │
│   └── api/
│       ├── servers.py               # /v1/servers routes
│       ├── api_keys.py              # /v1/api-keys routes
│       ├── roles.py                 # /v1/roles, /v1/roles/{id}/bindings, /permissions
│       ├── audit.py                 # /v1/audit query routes
│       └── health.py                # /healthz
├
├ alembic/
│   ├── env.py
│   └── versions/
│
├ tests/
│   ├── unit/
│   │   ├── test_rbac.py
│   │   ├── test_rate_limiter.py     # hypothesis property-based tests
│   │   └── test_jwt_validator.py
│   ├── integration/
│   │   ├── test_proxy_flow.py       # testcontainers: real Postgres + Redis + mock upstream
│   │   └── test_session_routing.py
│   └── conftest.py
│
├ deploy/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── railway.toml
│
├ docs/
│   ├── architecture.md
│   └── diagrams/
│
├ .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├ .env.example
├ pyproject.toml
├ alembic.ini
├ LICENSE
├ SECURITY.md
├ CONTRIBUTING.md
└ README.md
```

---

## Getting Started

### Prerequisites

- Docker + Docker Compose v2
- Python 3.12 (only needed for local, non-Docker development)
- An OIDC-compliant identity provider if you want to exercise OAuth 2.1 mode (Auth0/Keycloak/Zitadel all work — or use API-key mode with no IdP at all)

### Quickstart (Docker Compose)

```bash
git clone https://github.com/wisdom-dosoo/portcullis.git
cd portcullis
cp .env.example .env          # set API_KEY_PEPPER and any other required vars
docker compose -f deploy/docker-compose.yml up --build
```

This brings up Portcullis (`:8080`), Postgres, and Redis. Alembic migrations run automatically on container start via the `entrypoint` in `deploy/Dockerfile`.

Bootstrap your first admin API key using the CLI (run inside the container or locally against the same DB):

```bash
# Inside the container
docker compose -f deploy/docker-compose.yml exec portcullis portcullis bootstrap

# Or locally (requires DATABASE_URL and API_KEY_PEPPER env vars)
portcullis bootstrap
```

The command prints a one-time admin key. Store it securely — it cannot be recovered.

### Local Development (without Docker)

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
docker compose -f deploy/docker-compose.yml up -d postgres redis   # infra only
 alembic upgrade head
 uvicorn app.main:app --reload --port 8080
```

### Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Async Postgres DSN, e.g. `postgresql+asyncpg://user:pass@host:5432/portcullis` |
| `REDIS_URL` | yes | — | Redis connection string |
| `JWT_JWKS_URL` | no* | — | JWKS endpoint of your external IdP (*required if using OAuth mode) |
| `JWT_AUDIENCE` | no | `portcullis` | Expected `aud` claim on incoming bearer tokens |
| `JWT_ISSUER` | no | — | Expected `iss` claim |
| `API_KEY_PEPPER` | yes | — | Server-side secret mixed into API key hashing (rotate via re-issuance, not in place) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTLP collector endpoint; tracing is a no-op exporter if unset |
| `RATE_LIMIT_DEFAULT` | no | `100/minute` | Fallback limit applied when no more specific policy matches |
| `SESSION_TTL_SECONDS` | no | `3600` | Sliding TTL for the `Mcp-Session-Id` → upstream mapping |
| `CORS_ALLOWED_ORIGINS` | no | `*` | Comma-separated allow-list for the management API |
| `LOG_LEVEL` | no | `INFO` | structlog level |
| `ENVIRONMENT` | no | `development` | `development` / `staging` / `production` — gates debug endpoints and binds to loopback in dev |

---

## Registering an Upstream MCP Server

```bash
curl -X POST https://gateway.example.com/v1/servers \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "name": "GitHub MCP",
        "slug": "github-mcp",
        "upstream_url": "https://internal-github-mcp.svc.cluster.local/mcp",
        "transport": "streamable_http",
        "auth_mode": "service_token",
        "health_check_path": "/healthz"
      }'
```

Clients then call the proxied endpoint directly:

```bash
curl -X POST https://gateway.example.com/mcp/github-mcp \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"github_create_issue","arguments":{"repo":"acme/api","title":"Bug"}}}'
```

If `$AGENT_TOKEN`'s subject is not bound to a role that allows `github_create_*` on `github-mcp`, the response is a JSON-RPC error with code `-32002`, not a pass-through of whatever GitHub would have returned.

---

## API Reference

### 10.1 Management REST API

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/servers` | admin scope | Register a new upstream MCP server |
| `GET` | `/v1/servers` | any authenticated | List registered servers + live health status |
| `GET` | `/v1/servers/{slug}` | any authenticated | Server detail |
| `PATCH` | `/v1/servers/{slug}` | admin scope | Update upstream URL, auth mode, status |
| `DELETE` | `/v1/servers/{slug}` | admin scope | Deregister a server |
| `POST` | `/v1/api-keys` | admin scope | Issue a new API key (secret returned once) |
| `DELETE` | `/v1/api-keys/{id}` | admin scope | Revoke a key immediately |
| `POST` | `/v1/roles` | admin scope | Create a role |
| `POST` | `/v1/roles/{id}/bindings` | admin scope | Bind a role to a subject (API key or OAuth `sub`) |
| `POST` | `/v1/roles/{id}/permissions` | admin scope | Add a `{server, tool_pattern, effect}` rule |
| `GET` | `/v1/audit` | admin or auditor scope | Query the audit log (filter by subject, server, date range) |
| `GET` | `/healthz` | none | Liveness/readiness probe |
| `GET` | `/metrics` | none (network-restricted) | Prometheus exposition format |

### 10.2 MCP Proxy Endpoint

`ANY /mcp/{server_slug}` — accepts a standard MCP JSON-RPC 2.0 envelope over Streamable HTTP and forwards it to the registered upstream, subject to auth, RBAC, and rate-limit checks. `tools/list` responses are filtered server-side so a subject only ever sees tools it is permitted to call — this is deliberate: hiding forbidden tools is both a better UX for agents (no wasted `-32002` round trips) and reduces prompt/context bloat.

### 10.3 JSON-RPC Error Codes

| Code | Meaning | When Portcullis returns it |
|---|---|---|
| `-32700` | Parse error | Malformed JSON body |
| `-32600` | Invalid Request | Missing required JSON-RPC fields |
| `-32601` | Method not found | Upstream reports the method/tool does not exist |
| `-32602` | Invalid params | Schema validation failed (gateway- or upstream-side) |
| `-32603` | Internal error | Unhandled gateway or upstream failure |
| `-32001` | Unauthorized *(custom)* | Missing/invalid bearer token or API key |
| `-32002` | Forbidden *(custom)* | RBAC denies this subject/server/tool combination |
| `-32003` | Rate limited *(custom)* | Redis bucket exhausted; response includes `Retry-After` |
| `-32004` | Upstream unavailable *(custom)* | Health check failing / circuit breaker open |

Codes `-32001` through `-32004` sit in the JSON-RPC-reserved server-error range (`-32000` to `-32099`), per spec.

---

## Authentication & Authorization

### 11.1 OAuth 2.1 (Resource Server mode)

Portcullis validates — it does not issue — bearer tokens. On startup it fetches and caches the configured `JWT_JWKS_URL`; on each request it verifies signature, `exp`, `aud` (against `JWT_AUDIENCE`), and `iss` (against `JWT_ISSUER`). The token's `sub` claim becomes the RBAC subject. This deliberately mirrors standard resource-server patterns (the same shape as validating a token in front of any protected API) rather than reinventing OAuth.

### 11.2 API Keys

For service-to-service or simpler setups: keys are generated with a visible prefix (e.g., `pk_live_ab12`) for identification in logs, and only the **argon2 hash** of the full key is stored — the plaintext is shown exactly once at creation time. Keys carry an optional `scopes` array (`admin`, `auditor`, or none for a plain proxy-only key) checked before management-API access.

### 11.3 RBAC Model

```yaml
role: read_only_analyst
bindings:
  - subject_type: oauth_subject
    subject_id: "auth0|64f1a2b3c4d5"
permissions:
  - server: github-mcp
    tool_pattern: "github_list_*"
    effect: allow
  - server: github-mcp
    tool_pattern: "github_create_*"
    effect: deny
  - server: "*"
    tool_pattern: "*"
    effect: deny        # implicit fallback — nothing is reachable unless explicitly allowed
```

Evaluation order: most-specific server match first, then rule `priority`, then default-deny. This is a **default-deny** system by design — a newly registered server is invisible to every subject until a permission rule explicitly allows it.

---

## Rate Limiting

Rate limiting runs as a single atomic Redis Lua script per request (read-check-increment in one round trip, avoiding the classic read-then-write race under concurrency). Two strategies are supported:

- **Token bucket** — smooths bursts, good default for interactive agent use.
- **Sliding window** — stricter, used for expensive or destructive tools (e.g., `deploy_*`).

Policies resolve most-specific-first: `(subject, server, tool)` → `(subject, server)` → `(subject)` → `RATE_LIMIT_DEFAULT`. Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers; a denied request returns HTTP 429 and JSON-RPC error `-32003` with `Retry-After`.

---

## Observability

### 13.1 Tracing

Every proxied call opens an OpenTelemetry span (`mcp.tools.call`, `mcp.tools.list`, …) tagged with `subject_id`, `server_slug`, `tool_name`, and outcome, propagated across the gateway → upstream hop so a single trace shows the full path in Jaeger/Tempo/Honeycomb.

### 13.2 Metrics

`/metrics` exposes Prometheus counters/histograms: `portcullis_requests_total{server,tool,status}`, `portcullis_request_duration_seconds{server,tool}`, `portcullis_rate_limit_rejections_total{subject,server}`, `portcullis_upstream_health{server}`.

### 13.3 Audit Logging

Every decision — allowed or denied — is written asynchronously to the Postgres `audit_log` table, independent of tracing, so audit history survives even if the tracing backend is down or unconfigured.

---

## Database Schema

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    upstream_url TEXT NOT NULL,
    transport TEXT NOT NULL CHECK (transport IN ('streamable_http','stdio_bridge')),
    auth_mode TEXT NOT NULL DEFAULT 'none' CHECK (auth_mode IN ('none','bearer_passthrough','service_token')),
    service_token_secret TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','unhealthy')),
    health_check_path TEXT DEFAULT '/healthz',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slug)
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,          -- argon2id hash, never the plaintext key
    scopes TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (tenant_id, name)
);

CREATE TABLE role_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('api_key','oauth_subject')),
    subject_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tool_pattern TEXT NOT NULL,       -- glob, e.g. "github_list_*"
    effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
    priority INT NOT NULL DEFAULT 0
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL,        -- 'api_key' | 'oauth_subject'
    actor_id TEXT NOT NULL,
    server_id UUID REFERENCES mcp_servers(id),
    rpc_method TEXT NOT NULL,        -- 'tools/call', 'tools/list', ...
    tool_name TEXT,
    status TEXT NOT NULL,            -- 'allowed' | 'denied_rbac' | 'denied_rate_limit' | 'error'
    latency_ms INT,
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_tenant_created ON audit_log (tenant_id, created_at DESC);
```

**Redis key shapes (ephemeral, not schema-migrated):**

| Key pattern | Purpose | TTL |
|---|---|---|
| `rl:{tenant_id}:{subject_id}:{server_id}:{tool}` | Rate-limit bucket state | rolling, per-policy window |
| `session:{mcp_session_id}` | `{server_id, subject_id}` mapping | `SESSION_TTL_SECONDS` (sliding) |
| `registry:cache:{tenant_id}` | Serialized active-server list | 30s |

---

## Security Considerations

- **Default-deny RBAC** everywhere — a new server or role starts with zero effective permissions.
- **Origin validation + loopback binding in development**, per MCP transport security guidance, to mitigate DNS rebinding against local instances.
- **API keys are hashed with argon2id**; plaintext is shown exactly once and is not recoverable.
- **No internal error detail leaks to clients** — stack traces and upstream error bodies are logged server-side (via structlog) and mapped to the generic `-32603`/`-32004` codes at the boundary.
- **Secrets never in code** — `service_token_secret`, `API_KEY_PEPPER`, and JWKS URLs are environment-injected; `.env` is git-ignored, `.env.example` documents shape only.
- **Dependency and image scanning** run in CI (`pip-audit`, `gitleaks`, `trivy`) — see §17.
- **Tool annotations are hints, not security boundaries** — Portcullis never relies on an upstream-declared `readOnlyHint`/`destructiveHint` for enforcement; RBAC is the only enforcement layer.

---

## Testing Strategy

| Layer | Tooling | What it covers |
|---|---|---|
| Unit | pytest, pytest-asyncio | RBAC pattern matching, JWT validation edge cases, audit-log formatting |
| Property-based | Hypothesis | Rate limiter correctness under randomized concurrent request sequences — proves no over-admission regardless of timing |
| Integration | testcontainers-python (real Postgres + Redis) + a throwaway FastMCP mock upstream | Full proxy flow: auth → RBAC → rate limit → forward → audit write, exercised end-to-end |
| Contract | Custom JSON-RPC schema assertions | Every gateway-originated error response is valid JSON-RPC 2.0 with a code in the documented table |
| Load | Locust (local, on demand — not part of CI) | Confirms rate limiter holds under N concurrent subjects; informs the SLOs in §19 |

**Target: ≥80% line coverage on `app/`, enforced in CI via `--cov-fail-under=80`.** Coverage on `auth/` and `limits/` (the two components where a bug is a security bug) is held to a stricter 90% internally even though CI only gates the repo-wide number.

---

## CI/CD Pipeline

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[dev]"
      - run: ruff check .
      - run: mypy app

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[dev]"
      - run: alembic upgrade head
      - run: pytest --cov=app --cov-report=xml --cov-fail-under=80

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install pip-audit && pip-audit
      - uses: gitleaks/gitleaks-action@v2

  docker:
    needs: [lint, test, security]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: aquasecurity/trivy-action@master
        with: { image-ref: "ghcr.io/wisdom-dosoo/portcullis:build" }
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/wisdom-dosoo/portcullis:latest
```

`release.yml` (triggered on `v*` tags) rebuilds and pushes an immutable-tagged image, then calls the Railway deploy hook.

---

## Deployment

### 18.1 Docker / Self-Hosted

```yaml
# deploy/docker-compose.yml
services:
  portcullis:
    build: ../.
    ports: ["8080:8080"]
    env_file: ../.env
    depends_on: [postgres, redis]
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: portcullis
      POSTGRES_PASSWORD: portcullis
      POSTGRES_DB: portcullis
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
  jaeger:
    image: jaegertracing/all-in-one:1.57
    ports: ["16686:16686"]
volumes:
  pgdata:
```

### 18.2 Railway (hosted demo)

Chosen over serverless (Vercel-style) because Portcullis is a long-running, stateful service holding DB/Redis connection pools — a poor fit for cold-start-per-invocation platforms. Railway provisions managed Postgres + Redis add-ons and deploys straight from the `Dockerfile`; `deploy/railway.toml` pins build/start commands and health-check path.

### 18.3 Cloudflare in Front

Cloudflare proxies the public hostname for TLS termination, DDoS mitigation, and a WAF rule restricting `/v1/*` management-API paths to an IP allow-list, while `/mcp/*` remains open to authenticated agent traffic.

---

## Design Targets (SLOs)

These are **targets to validate with load testing once implemented**, not measured production numbers — stated here so "done" has a concrete definition:

| Metric | Target |
|---|---|
| p50 proxy overhead (gateway processing time, excluding upstream) | < 15ms |
| p99 proxy overhead | < 75ms |
| Rate-limiter check latency | < 5ms (single Redis round trip) |
| Availability (gateway itself, excluding upstream outages) | 99.9% |
| Audit log write durability | At-least-once; async write must not block the client response |

---

## Roadmap

- [ ] v0.1 — Registry, proxy, API-key auth, RBAC, Redis rate limiting (MVP)
- [ ] v0.2 — OAuth 2.1/JWKS auth, OpenTelemetry tracing, Prometheus metrics
- [ ] v0.3 — Admin UI (read-only dashboard for servers/roles/audit)
- [ ] v0.4 — stdio-bridge adapter for local-only upstreams
- [ ] v0.5 — Multi-tenant SaaS mode (hosted, managed Portcullis)
- [ ] v1.0 — Helm chart, SCIM for role provisioning, SOC 2-oriented audit export

---

## Architecture Decision Records

| # | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| ADR-001 | Postgres for control-plane data | MongoDB | Relational integrity for RBAC joins and audit queries; ACID for permission changes |
| ADR-002 | Redis Lua scripts for rate limiting | App-level counters | Atomicity under concurrency; avoids read-then-write races across replicas |
| ADR-003 | Resource Server, not Authorization Server | Build a full OIDC provider in-repo | Avoids duplicating the `keyforge` project's scope; lets teams bring an existing IdP |
| ADR-004 | Streamable HTTP as the primary transport | stdio-only | Only transport supporting multiple concurrent remote clients per MCP spec |
| ADR-005 | Default-deny RBAC | Default-allow with a denylist | Least-privilege is the safer default for a security-sensitive gateway |
| ADR-006 | Async SQLAlchemy 2.0 + asyncpg | Sync SQLAlchemy | Matches FastAPI's async model end-to-end; a blocking DB call would stall the event loop under load |
| ADR-007 | OpenTelemetry from day one | Add observability later | Retrofitting tracing into a gateway is expensive, and observability is the product's core value proposition, not an add-on |

---

## Glossary

- **MCP (Model Context Protocol)** — an open protocol standardizing how AI applications provide context (tools, resources, prompts) to LLMs.
- **Tool** — an executable capability an MCP server exposes (e.g., `github_create_issue`).
- **Resource** — MCP's mechanism for exposing readable data via URI templates, distinct from Tools' parameterized actions.
- **Transport** — the wire protocol connecting client and server: **stdio** (local subprocess) or **Streamable HTTP** (remote, multi-client).
- **Session** — a logical conversation between a client and an upstream server, identified by an `Mcp-Session-Id`, which may span multiple HTTP requests.
- **JSON-RPC 2.0** — the message format MCP is built on; every request/response is a JSON-RPC envelope with `jsonrpc`, `id`, `method`/`result`/`error`.

---

## Contributing

See `CONTRIBUTING.md` for the full workflow. In short: fork → feature branch → `ruff check . && mypy app && pytest` passing locally → PR against `main` → CI must pass (lint, test, security) before merge. Good-first-issue candidates: additional rate-limit strategies, a Helm chart, an admin UI, and a stdio-bridge adapter — see the [Roadmap](#20-roadmap) and open issues labeled `good first issue`.

---

## License

Apache License 2.0 — see `LICENSE`.

Product, licensing, and monetization strategy (including why every feature is open and how Portcullis Cloud is positioned): see `docs/strategy.md`. Governance and contribution: see `GOVERNANCE.md`.