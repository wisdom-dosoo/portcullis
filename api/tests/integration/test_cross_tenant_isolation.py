"""Cross-tenant isolation proof suite.

Proves that tenant_id + subject_type + subject_id correctly scopes:
- RBAC permissions
- Server registry
- API key namespace
- Audit log queries
- Rate-limit buckets
- Full proxy pipeline (auth → registry → RBAC → forward)

This closes Gap 1: production-readiness-review.md:78 and review.md:5.
"""

from __future__ import annotations

import json
import uuid
from uuid import UUID

import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.api_keys import issue_key
from app.config import get_settings
from app.gateway.session import SessionStore
from app.limits.policies import EffectivePolicy
from app.limits.redis_bucket import RateLimiter, build_key
from app.main import create_app
from app.models.db import create_session_factory
from app.models.orm import (
    AuditEventType,
    PermissionEffect,
    RateLimitAlgorithm,
    ServerStatus,
    SubjectType,
    Tenant,
)
from app.models.schemas import ServerCreate
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository
from app.runtime import Runtime

TENANT_A = UUID("10000000-0000-0000-0000-000000000001")
TENANT_B = UUID("10000000-0000-0000-0000-000000000002")
TENANT_C = UUID("10000000-0000-0000-0000-000000000003")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ensure_tenant(session: AsyncSession, tenant_id: UUID, slug: str) -> None:
    existing = await session.get(Tenant, tenant_id)
    if existing is None:
        session.add(Tenant(id=tenant_id, name=slug, slug=slug))
        await session.flush()


async def _issue_key_for_tenant(
    async_engine: AsyncEngine,
    tenant_id: UUID,
    name: str = "test-key",
    scopes: list[str] | None = None,
) -> tuple[str, UUID]:
    scopes = scopes or ["admin"]
    factory = create_session_factory(async_engine)
    async with factory() as session:
        async with session.begin():
            await _ensure_tenant(session, tenant_id, f"tenant-{str(tenant_id)[:8]}")
        # commit tenant before issuing key (separate transaction)
        await session.commit()
    factory2 = create_session_factory(async_engine)
    async with factory2() as session:
        issued = await issue_key(
            name=name,
            scopes=scopes,
            pepper=get_settings().api_key_pepper,
            session=session,
            tenant_id=tenant_id,
        )
        return issued.plaintext, issued.key_id


def _rpc(method: str, params: object | None = None, _id: int | None = 1) -> bytes:
    body: dict[str, object] = {"jsonrpc": "2.0", "id": _id, "method": method}
    if params is not None:
        body["params"] = params
    return json.dumps(body).encode()


def _upstream_ok(request: httpx.Request) -> httpx.Response:
    try:
        payload = json.loads(request.read())
    except Exception:
        payload = {}
    if payload.get("method") == "tools/list":
        content = json.dumps(
            {"jsonrpc": "2.0", "id": payload.get("id"), "result": {"tools": [{"name": "x", "description": "x"}]}}
        ).encode()
    elif payload.get("method") == "tools/call":
        content = json.dumps(
            {"jsonrpc": "2.0", "id": payload.get("id"), "result": {"content": [{"type": "text", "text": "ok"}]}}
        ).encode()
    else:
        content = json.dumps({"jsonrpc": "2.0", "id": payload.get("id"), "result": {}}).encode()
    return httpx.Response(status_code=200, content=content, headers={"content-type": "application/json"})


# ---------------------------------------------------------------------------
# Repository-level isolation
# ---------------------------------------------------------------------------


async def test_rbac_tenant_isolation(async_session: AsyncSession) -> None:
    """Same subject_id bound in two tenants must see disjoint permission sets."""
    await _ensure_tenant(async_session, TENANT_A, "tenant-a-rbac")
    await _ensure_tenant(async_session, TENANT_B, "tenant-b-rbac")
    await async_session.commit()

    repo = RbacRepository(async_session)
    subject = "shared-subject-001"

    role_a = await repo.create_role(TENANT_A, "role-a")
    await repo.create_permission(role_a.id, "server-a", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_a.id, subject, SubjectType.API_KEY)

    role_b = await repo.create_role(TENANT_B, "role-b")
    await repo.create_permission(role_b.id, "server-b", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_b.id, subject, SubjectType.API_KEY)
    await async_session.commit()

    perms_a = await repo.get_permissions_for_subject(TENANT_A, SubjectType.API_KEY, subject)
    perms_b = await repo.get_permissions_for_subject(TENANT_B, SubjectType.API_KEY, subject)

    assert {p.server_pattern for p in perms_a} == {"server-a"}
    assert {p.server_pattern for p in perms_b} == {"server-b"}


async def test_rbac_subject_type_isolation(async_session: AsyncSession) -> None:
    """API_KEY and OAUTH_SUBJECT with same string must not collide within a tenant."""
    await _ensure_tenant(async_session, TENANT_A, "tenant-a-type")
    await async_session.commit()

    repo = RbacRepository(async_session)
    shared = "collision-id-xyz"

    role_api = await repo.create_role(TENANT_A, "role-api")
    await repo.create_permission(role_api.id, "server-api", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_api.id, shared, SubjectType.API_KEY)

    role_oauth = await repo.create_role(TENANT_A, "role-oauth")
    await repo.create_permission(role_oauth.id, "server-oauth", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_oauth.id, shared, SubjectType.OAUTH_SUBJECT)
    await async_session.commit()

    api_perms = await repo.get_permissions_for_subject(TENANT_A, SubjectType.API_KEY, shared)
    oauth_perms = await repo.get_permissions_for_subject(TENANT_A, SubjectType.OAUTH_SUBJECT, shared)

    assert {p.server_pattern for p in api_perms} == {"server-api"}
    assert {p.server_pattern for p in oauth_perms} == {"server-oauth"}


async def test_server_registry_tenant_isolation(async_session: AsyncSession) -> None:
    """Servers are visible only within their tenant."""
    await _ensure_tenant(async_session, TENANT_A, "tenant-a-srv")
    await _ensure_tenant(async_session, TENANT_B, "tenant-b-srv")
    await async_session.commit()

    repo = ServerRepository(async_session)
    # Create server with same slug in both tenants — must succeed (unique per tenant)
    await repo.create(TENANT_A, ServerCreate(name="Demo", slug="shared-slug", upstream_url="http://a.internal/mcp"))
    await repo.create(TENANT_B, ServerCreate(name="Demo", slug="shared-slug", upstream_url="http://b.internal/mcp"))
    await async_session.commit()

    a_srv = await repo.get_by_slug(TENANT_A, "shared-slug")
    b_srv = await repo.get_by_slug(TENANT_B, "shared-slug")
    c_srv = await repo.get_by_slug(TENANT_C, "shared-slug")

    assert a_srv is not None and str(a_srv.upstream_url) == "http://a.internal/mcp"
    assert b_srv is not None and str(b_srv.upstream_url) == "http://b.internal/mcp"
    assert c_srv is None

    assert len(await repo.list(TENANT_A)) >= 1
    # ensure Tenant A list does not contain Tenant B's server URL
    urls_a = {str(s.upstream_url) for s in await repo.list(TENANT_A)}
    assert "http://b.internal/mcp" not in urls_a


async def test_audit_log_tenant_isolation(async_session: AsyncSession) -> None:
    """Audit rows are queryable only within their tenant."""
    await _ensure_tenant(async_session, TENANT_A, "tenant-a-audit")
    await _ensure_tenant(async_session, TENANT_B, "tenant-b-audit")
    await async_session.commit()

    repo = AuditRepository(async_session)
    await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=TENANT_A, server_slug="srv-a", subject_id="user-a")
    await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=TENANT_B, server_slug="srv-b", subject_id="user-b")
    await async_session.commit()

    logs_a = await repo.list(TENANT_A, limit=100)
    logs_b = await repo.list(TENANT_B, limit=100)

    assert all(r.tenant_id == TENANT_A for r in logs_a)
    assert all(r.tenant_id == TENANT_B for r in logs_b)
    assert any(r.server_slug == "srv-a" for r in logs_a)
    assert not any(r.server_slug == "srv-b" for r in logs_a)


async def test_rate_limit_bucket_tenant_isolation(redis_client: Redis) -> None:
    """Redis rate-limit keys namespace by tenant_id so tenants cannot starve each other."""
    key_a = build_key(TENANT_A, "user-1", "demo", "tools/call")
    key_b = build_key(TENANT_B, "user-1", "demo", "tools/call")
    assert key_a != key_b
    assert str(TENANT_A) in key_a
    assert str(TENANT_B) in key_b

    # Exhaust tenant A bucket, tenant B must still be allowed
    limiter = RateLimiter(redis_client)  # type: ignore[arg-type]
    policy = EffectivePolicy(algorithm=RateLimitAlgorithm.SLIDING_WINDOW, request_limit=1, window_seconds=60, burst_capacity=None)

    # Clean slate
    await redis_client.delete(key_a)  # type: ignore[arg-type]
    await redis_client.delete(key_b)  # type: ignore[arg-type]

    r1 = await limiter.check(TENANT_A, "user-1", "demo", "tools/call", policy)
    assert r1.allowed is True
    r2 = await limiter.check(TENANT_A, "user-1", "demo", "tools/call", policy)
    assert r2.allowed is False  # exhausted

    r3 = await limiter.check(TENANT_B, "user-1", "demo", "tools/call", policy)
    assert r3.allowed is True  # tenant B unaffected


async def test_session_store_tenant_isolation(redis_client: Redis) -> None:
    """Mcp-Session-Id records are bound to tenant+subject+server and lookup validates ownership."""
    store = SessionStore(redis_client)  # type: ignore[arg-type]
    sid = f"test-sid-{uuid.uuid4()}"
    await store.record(sid, tenant_id=TENANT_A, subject_id="user-a", server_slug="srv-a")

    rec = await store.lookup(sid)
    assert rec is not None
    assert rec["tenant_id"] == str(TENANT_A)

    # Different tenant must not match
    from app.gateway.session import matches

    assert matches(rec, tenant_id=TENANT_A, subject_id="user-a", server_slug="srv-a") is True
    assert matches(rec, tenant_id=TENANT_B, subject_id="user-a", server_slug="srv-a") is False
    assert matches(rec, tenant_id=TENANT_A, subject_id="user-b", server_slug="srv-a") is False

    # Cleanup
    await store.delete(sid)
    assert await store.lookup(sid) is None


# ---------------------------------------------------------------------------
# Proxy pipeline isolation (end-to-end through ASGI client)
# ---------------------------------------------------------------------------


async def test_proxy_tenant_isolation_full_pipeline(
    async_engine: AsyncEngine,
    redis_container: str,
) -> None:
    """Tenant A key must not reach Tenant B server — proxy returns 503 (not found for this tenant)."""
    # Seed Tenant A and B
    tenant_a_key, _ = await _issue_key_for_tenant(async_engine, TENANT_A, "a-key", ["admin"])
    tenant_b_key, _ = await _issue_key_for_tenant(async_engine, TENANT_B, "b-key", ["admin"])

    # Create server only in Tenant B
    factory = create_session_factory(async_engine)
    async with factory() as session:
        await _ensure_tenant(session, TENANT_B, "tenant-b-proxy")
        await session.commit()
    async with factory() as session:
        repo = ServerRepository(session)
        # Ensure no server in A with this slug, create in B
        existing_b = await repo.get_by_slug(TENANT_B, "isolated-srv")
        if existing_b is None:
            await repo.create(TENANT_B, ServerCreate(name="Isolated", slug="isolated-srv", upstream_url="http://b.internal/mcp"))
            await session.commit()

    # Also create permission for B's key on B's server
    async with factory() as session:
        rbac = RbacRepository(session)
        role = await rbac.create_role(TENANT_B, "b-role")
        await rbac.create_permission(role.id, "isolated-srv", "*", PermissionEffect.ALLOW, 0)
        # need subject_id = api_key id, not plaintext; fetch key by prefix
        from app.repositories.api_keys import ApiKeyRepository

        # parse prefix from plaintext
        prefix = tenant_b_key.split("_")[1]
        key_row = await ApiKeyRepository(session).get_by_prefix(prefix)
        assert key_row is not None
        await rbac.create_binding(role.id, str(key_row.id), SubjectType.API_KEY)
        await session.commit()
        b_subject_id = str(key_row.id)

    # Build ASGI app with mocked upstream
    from app.runtime import Runtime

    redis = Redis.from_url(redis_container, decode_responses=False)
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(_upstream_ok))
    runtime = Runtime(engine=async_engine, session_factory=create_session_factory(async_engine), redis=redis, http_client=http_client)
    app = create_app()
    app.state.runtime = runtime  # type: ignore[attr-defined]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:  # type: ignore[arg-type]
        # Tenant A key hitting isolated-srv must get 503 (server not found for tenant A)
        resp = await client.post(
            "/mcp/isolated-srv",
            headers={"Authorization": f"Bearer {tenant_a_key}"},
            content=_rpc("tools/list"),
        )
        assert resp.status_code == 503, f"expected 503 for cross-tenant access, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["error"]["code"] == -32004

        # Tenant B key hitting same slug must succeed (or at least not 503 from registry)
        # It will pass registry and hit RBAC — should be 200 (we granted wildcard)
        resp2 = await client.post(
            "/mcp/isolated-srv",
            headers={"Authorization": f"Bearer {tenant_b_key}"},
            content=_rpc("tools/list"),
        )
        # 200 with filtered tools (wildcard allows)
        assert resp2.status_code == 200, f"expected 200 for own-tenant access, got {resp2.status_code}: {resp2.text}"

    await redis.aclose()
    await http_client.aclose()


async def test_proxy_rbac_tenant_isolation_same_tool(
    async_engine: AsyncEngine,
    redis_container: str,
) -> None:
    """Same tool name allowed in Tenant A must be denied when subject belongs to Tenant B."""
    # Create two tenants each with a server of same slug but different permissions
    factory = create_session_factory(async_engine)
    # Issue keys
    key_a, _ = await _issue_key_for_tenant(async_engine, TENANT_A, "rbac-a-key", ["admin"])
    key_b, _ = await _issue_key_for_tenant(async_engine, TENANT_B, "rbac-b-key", ["admin"])

    # Ensure servers exist
    for tid in (TENANT_A, TENANT_B):
        async with factory() as session:
            await _ensure_tenant(session, tid, f"tenant-{str(tid)[:4]}")
            await session.commit()
        async with factory() as session:
            repo = ServerRepository(session)
            if await repo.get_by_slug(tid, "shared-tool-srv") is None:
                await repo.create(tid, ServerCreate(name="S", slug="shared-tool-srv", upstream_url="http://x.internal/mcp"))
                await session.commit()

    # Grant Tenant A key permission for "secret_tool" on shared-tool-srv; Tenant B gets no such permission
    async with factory() as session:
        from app.repositories.api_keys import ApiKeyRepository

        rbac = RbacRepository(session)
        # Tenant A binding
        prefix_a = key_a.split("_")[1]
        row_a = await ApiKeyRepository(session).get_by_prefix(prefix_a)
        assert row_a is not None
        role_a = await rbac.create_role(TENANT_A, "a-allow-secret")
        await rbac.create_permission(role_a.id, "shared-tool-srv", "secret_tool", PermissionEffect.ALLOW, 0)
        await rbac.create_binding(role_a.id, str(row_a.id), SubjectType.API_KEY)
        await session.commit()

        # Tenant B: create a role but with different tool
        prefix_b = key_b.split("_")[1]
        row_b = await ApiKeyRepository(session).get_by_prefix(prefix_b)
        assert row_b is not None
        role_b = await rbac.create_role(TENANT_B, "b-allow-other")
        await rbac.create_permission(role_b.id, "shared-tool-srv", "other_tool", PermissionEffect.ALLOW, 0)
        await rbac.create_binding(role_b.id, str(row_b.id), SubjectType.API_KEY)
        await session.commit()

    redis = Redis.from_url(redis_container, decode_responses=False)
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(_upstream_ok))
    runtime = Runtime(engine=async_engine, session_factory=create_session_factory(async_engine), redis=redis, http_client=http_client)
    app = create_app()
    app.state.runtime = runtime  # type: ignore[attr-defined]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:  # type: ignore[arg-type]
        # Tenant A calling secret_tool -> allowed (200)
        resp_a = await client.post(
            "/mcp/shared-tool-srv",
            headers={"Authorization": f"Bearer {key_a}"},
            content=_rpc("tools/call", {"name": "secret_tool", "arguments": {}}),
        )
        assert resp_a.status_code == 200, resp_a.text

        # Tenant B calling secret_tool -> denied (403) because B's role only allows other_tool
        resp_b = await client.post(
            "/mcp/shared-tool-srv",
            headers={"Authorization": f"Bearer {key_b}"},
            content=_rpc("tools/call", {"name": "secret_tool", "arguments": {}}),
        )
        assert resp_b.status_code == 403, f"expected 403 cross-tenant RBAC deny, got {resp_b.status_code}: {resp_b.text}"
        assert resp_b.json()["error"]["code"] == -32002

    await redis.aclose()
    await http_client.aclose()
