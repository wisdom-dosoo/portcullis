# Architecture

## v0.1 Overview

Portcullis follows a five-layer design: **API** (FastAPI routes) → **Services / Auth** (RBAC engine, key verification, registry) → **Repositories** (SQLAlchemy async data access) → **Infrastructure adapters** (Redis rate limiter, httpx upstream proxy) → **Postgres and Redis** (persistence and ephemeral state). Every inbound request enters through a single `POST /mcp/{server_slug}` gateway endpoint that enforces the full pipeline before a byte reaches an upstream MCP server; the management REST API (`/v1/servers`, `/v1/api-keys`, `/v1/roles`, `/v1/rate-limit-policies`) sits alongside it under the same FastAPI application, separated only by router prefix.

## Security Properties

Three properties are enforced unconditionally and cannot be misconfigured away. First, **default-deny RBAC**: a subject with no role bindings cannot call any tool on any server — the permission evaluator returns deny whenever no matching rule exists, so a newly registered server is invisible to all clients until an admin explicitly grants access. Second, **Argon2id API key hashing**: the plaintext key is shown exactly once at issuance and never stored; only the argon2id hash (with a server-side pepper) is persisted, so a database dump does not yield usable credentials. Third, **Redis fail-closed rate limiting**: the Lua-script atomic check runs in a single Redis round trip; if Redis is unreachable the gateway returns `503` rather than allowing the request through, preventing a backend outage from becoming a rate-limit bypass.

## Request Pipeline

For every proxied call the order is fixed: (1) parse and validate the JSON-RPC envelope; (2) pre-auth sliding-window rate check by client IP (rejects unauthenticated floods before touching the DB); (3) API key verification via Argon2id hash lookup; (4) server registry lookup (must be `ACTIVE`); (5) RBAC evaluation against the subject's role-bound tool permissions — `tools/call` is blocked here if no matching allow rule exists; (6) per-subject/per-server/per-tool rate-limit check via Redis Lua script; (7) forward to the upstream over Streamable HTTP; (8) for `tools/list` responses, filter the returned tool list through the RBAC engine before returning it to the client so subjects never see tools they cannot call.
