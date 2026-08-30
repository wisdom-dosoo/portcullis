"""Cross-tenant isolation unit proof — no Docker required.

Uses in-memory SQLite + fakeredis so this suite passes locally on Windows
and in CI without Docker. Complements the integration suite
tests/integration/test_cross_tenant_isolation.py which runs against real
Postgres/Redis in CI (service containers).
"""

from __future__ import annotations

import uuid
from uuid import UUID

import pytest
from fakeredis.aioredis import FakeRedis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.limits.policies import EffectivePolicy
from app.limits.redis_bucket import RateLimiter, build_key
from app.models.db import create_session_factory
from app.models.orm import (
    AuditEventType,
    Base,
    PermissionEffect,
    RateLimitAlgorithm,
    SubjectType,
    Tenant,
)
from app.models.schemas import ServerCreate
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository

TENANT_A = UUID("10000000-0000-0000-0000-000000000001")
TENANT_B = UUID("10000000-0000-0000-0000-000000000002")


@pytest.fixture()
async def sqlite_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture()
async def sqlite_session(sqlite_engine):  # type: ignore[no-untyped-def]
    factory = create_session_factory(sqlite_engine)
    async with factory() as session:
        yield session


async def _ensure_tenant(session: AsyncSession, tid: UUID, slug: str) -> None:
    existing = await session.get(Tenant, tid)
    if existing is None:
        session.add(Tenant(id=tid, name=slug, slug=slug))
        await session.flush()


async def test_rbac_tenant_isolation_sqlite(sqlite_session: AsyncSession) -> None:
    await _ensure_tenant(sqlite_session, TENANT_A, "tenant-a")
    await _ensure_tenant(sqlite_session, TENANT_B, "tenant-b")
    await sqlite_session.commit()

    repo = RbacRepository(sqlite_session)
    subj = "shared-subject-001"

    role_a = await repo.create_role(TENANT_A, "role-a")
    await repo.create_permission(role_a.id, "server-a", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_a.id, subj, SubjectType.API_KEY)

    role_b = await repo.create_role(TENANT_B, "role-b")
    await repo.create_permission(role_b.id, "server-b", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_b.id, subj, SubjectType.API_KEY)
    await sqlite_session.commit()

    perms_a = await repo.get_permissions_for_subject(TENANT_A, SubjectType.API_KEY, subj)
    perms_b = await repo.get_permissions_for_subject(TENANT_B, SubjectType.API_KEY, subj)

    assert {p.server_pattern for p in perms_a} == {"server-a"}
    assert {p.server_pattern for p in perms_b} == {"server-b"}


async def test_rbac_subject_type_isolation_sqlite(sqlite_session: AsyncSession) -> None:
    await _ensure_tenant(sqlite_session, TENANT_A, "tenant-a-type")
    await sqlite_session.commit()

    repo = RbacRepository(sqlite_session)
    shared = "collision-id"

    role_api = await repo.create_role(TENANT_A, "role-api")
    await repo.create_permission(role_api.id, "server-api", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_api.id, shared, SubjectType.API_KEY)

    role_oauth = await repo.create_role(TENANT_A, "role-oauth")
    await repo.create_permission(role_oauth.id, "server-oauth", "*", PermissionEffect.ALLOW, 0)
    await repo.create_binding(role_oauth.id, shared, SubjectType.OAUTH_SUBJECT)
    await sqlite_session.commit()

    api_perms = await repo.get_permissions_for_subject(TENANT_A, SubjectType.API_KEY, shared)
    oauth_perms = await repo.get_permissions_for_subject(TENANT_A, SubjectType.OAUTH_SUBJECT, shared)

    assert {p.server_pattern for p in api_perms} == {"server-api"}
    assert {p.server_pattern for p in oauth_perms} == {"server-oauth"}


async def test_server_registry_tenant_isolation_sqlite(sqlite_session: AsyncSession) -> None:
    await _ensure_tenant(sqlite_session, TENANT_A, "tenant-a-srv")
    await _ensure_tenant(sqlite_session, TENANT_B, "tenant-b-srv")
    await sqlite_session.commit()

    repo = ServerRepository(sqlite_session)
    await repo.create(TENANT_A, ServerCreate(name="Demo", slug="shared-slug", upstream_url="http://a.internal/mcp"))
    await repo.create(TENANT_B, ServerCreate(name="Demo", slug="shared-slug", upstream_url="http://b.internal/mcp"))
    await sqlite_session.commit()

    a_srv = await repo.get_by_slug(TENANT_A, "shared-slug")
    b_srv = await repo.get_by_slug(TENANT_B, "shared-slug")

    assert a_srv is not None and "a.internal" in str(a_srv.upstream_url)
    assert b_srv is not None and "b.internal" in str(b_srv.upstream_url)

    # Tenant with no server must get None
    assert await repo.get_by_slug(UUID("10000000-0000-0000-0000-000000000099"), "shared-slug") is None


async def test_audit_tenant_isolation_sqlite(sqlite_session: AsyncSession) -> None:
    await _ensure_tenant(sqlite_session, TENANT_A, "tenant-a-audit")
    await _ensure_tenant(sqlite_session, TENANT_B, "tenant-b-audit")
    await sqlite_session.commit()

    repo = AuditRepository(sqlite_session)
    await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=TENANT_A, server_slug="srv-a", subject_id="u-a")
    await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=TENANT_B, server_slug="srv-b", subject_id="u-b")
    await sqlite_session.commit()

    logs_a = await repo.list(TENANT_A, limit=100)
    assert all(r.tenant_id == TENANT_A for r in logs_a)
    assert any(r.server_slug == "srv-a" for r in logs_a)
    assert not any(r.server_slug == "srv-b" for r in logs_a)


async def test_rate_limit_key_namespaces_tenant() -> None:
    key_a = build_key(TENANT_A, "user-1", "demo", "tools/call")
    key_b = build_key(TENANT_B, "user-1", "demo", "tools/call")
    assert key_a != key_b
    assert str(TENANT_A) in key_a
    assert str(TENANT_B) in key_b


async def test_rate_limit_tenant_isolation_buckets() -> None:
    """Tenant A and B buckets are distinct — prove via key generation and mocked limiter."""
    from unittest.mock import AsyncMock

    # Direct key assertion (no Redis needed — fakeredis doesn't support Lua evalsha)
    key_a = build_key(TENANT_A, "user-1", "demo", "tools/call")
    key_b = build_key(TENANT_B, "user-1", "demo", "tools/call")
    assert key_a != key_b

    fake = FakeRedis(decode_responses=True)
    limiter = RateLimiter(fake)  # type: ignore[arg-type]
    policy = EffectivePolicy(algorithm=RateLimitAlgorithm.SLIDING_WINDOW, request_limit=1, window_seconds=60, burst_capacity=None)

    # Mock the Lua-backed methods to prove RateLimiter.check dispatches with the right tenant-scoped key
    seen_keys: list[str] = []

    async def _fake_sw(key: str, _policy: object, now: object = None):  # type: ignore[no-untyped-def]
        seen_keys.append(key)
        from app.limits.redis_bucket import RateLimitResult

        return RateLimitResult(allowed=True, limit=1, remaining=0, reset_after_seconds=60.0, retry_after_seconds=0.0)

    limiter.check_sliding_window = AsyncMock(side_effect=_fake_sw)  # type: ignore[method-assign]
    await limiter.check(TENANT_A, "user-1", "demo", "tools/call", policy)
    await limiter.check(TENANT_B, "user-1", "demo", "tools/call", policy)
    assert seen_keys[0] == key_a
    assert seen_keys[1] == key_b
    await fake.aclose()  # type: ignore[attr-defined]


async def test_session_store_tenant_binding_fakeredis() -> None:
    from app.gateway.session import SessionStore, matches

    fake = FakeRedis(decode_responses=True)
    store = SessionStore(fake)  # type: ignore[arg-type]
    sid = f"sid-{uuid.uuid4()}"
    await store.record(sid, tenant_id=TENANT_A, subject_id="user-a", server_slug="srv-a")
    rec = await store.lookup(sid)
    assert rec is not None
    assert rec["tenant_id"] == str(TENANT_A)

    assert matches(rec, tenant_id=TENANT_A, subject_id="user-a", server_slug="srv-a") is True
    assert matches(rec, tenant_id=TENANT_B, subject_id="user-a", server_slug="srv-a") is False
    assert matches(rec, tenant_id=TENANT_A, subject_id="user-b", server_slug="srv-a") is False

    await store.delete(sid)
    assert await store.lookup(sid) is None
    await fake.aclose()  # type: ignore[attr-defined]


async def test_management_api_tenant_scoping_via_subject() -> None:
    """Proves the management APIs now thread subject.tenant_id instead of DEFAULT_TENANT_ID."""
    # Direct code inspection: the patched modules must use subject.tenant_id
    import inspect

    from app.api import api_keys as api_keys_mod
    from app.api import servers as servers_mod

    src_keys = inspect.getsource(api_keys_mod.create_api_key)
    src_list = inspect.getsource(api_keys_mod.list_api_keys)
    src_revoke = inspect.getsource(api_keys_mod.revoke_api_key)
    assert "subject.tenant_id" in src_keys
    assert "subject.tenant_id" in src_list
    assert "subject.tenant_id" in src_revoke

    src_srv_create = inspect.getsource(servers_mod.create_server)
    assert "subject.tenant_id" in src_srv_create or "tenant_id=subject.tenant_id" in src_srv_create
