"""Gap 5: Audit hash-chain verification — SQLite + in-memory, no Docker required."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.db import create_session_factory
from app.models.orm import AuditEventType, Base, Tenant
from app.repositories.audit import AuditRepository

TENANT = UUID("10000000-0000-0000-0000-0000000000a1")


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


async def test_audit_chain_hashes_link(sqlite_session):  # type: ignore[no-untyped-def]
    tenant_id = TENANT
    sqlite_session.add(Tenant(id=tenant_id, name="t", slug="t-hash"))
    await sqlite_session.flush()

    repo = AuditRepository(sqlite_session)
    first = await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=tenant_id, subject_id="u1", server_slug="s1")
    await sqlite_session.commit()

    assert first.prev_hash is None
    assert first.entry_hash is not None
    assert len(first.entry_hash) == 64

    second = await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=tenant_id, subject_id="u1", server_slug="s1")
    await sqlite_session.commit()

    assert second.prev_hash == first.entry_hash
    assert second.entry_hash != first.entry_hash

    # Chain verification must pass for intact chain
    ok, err = await repo.verify_chain(tenant_id)
    assert ok, err


async def test_audit_chain_cross_tenant_isolation(sqlite_session):  # type: ignore[no-untyped-def]
    t1 = UUID("10000000-0000-0000-0000-0000000000a2")
    t2 = UUID("10000000-0000-0000-0000-0000000000a3")
    for tid, slug in [(t1, "t1"), (t2, "t2")]:
        sqlite_session.add(Tenant(id=tid, name=slug, slug=slug))
    await sqlite_session.flush()

    repo = AuditRepository(sqlite_session)
    a1 = await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=t1, subject_id="u1")
    await sqlite_session.commit()
    b1 = await repo.create(event_type=AuditEventType.TOOL_CALL, outcome="allowed", tenant_id=t2, subject_id="u1")
    await sqlite_session.commit()

    # Each tenant's chain starts fresh (prev_hash None)
    assert a1.prev_hash is None
    assert b1.prev_hash is None
    assert a1.entry_hash != b1.entry_hash  # different tenant_id in hash payload
