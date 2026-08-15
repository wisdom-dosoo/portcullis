"""Integration tests for the gateway SessionStore against a real Redis container."""

from __future__ import annotations

from uuid import UUID, uuid4

from redis.asyncio import Redis

from app.gateway.session import SESSION_KEY_PREFIX, SessionStore, _session_key, matches

TENANT_A = UUID("00000000-0000-0000-0000-000000000001")
TENANT_B = UUID("00000000-0000-0000-0000-000000000002")


async def test_record_round_trip(redis_client: Redis) -> None:
    store = SessionStore(redis_client)
    session_id = f"sess-{uuid4()}"

    await store.record(
        session_id,
        tenant_id=str(TENANT_A),
        subject_id="subj-1",
        server_slug="demo",
    )

    record = await store.lookup(session_id)
    assert record is not None
    assert record["tenant_id"] == str(TENANT_A)
    assert record["subject_id"] == "subj-1"
    assert record["server_slug"] == "demo"


async def test_record_sets_ttl(redis_client: Redis) -> None:
    store = SessionStore(redis_client)
    session_id = f"sess-ttl-{uuid4()}"

    await store.record(
        session_id,
        tenant_id=str(TENANT_A),
        subject_id="subj-1",
        server_slug="demo",
    )

    ttl = await redis_client.ttl(_session_key(session_id))
    assert ttl > 0
    # The upstream records start with the expected prefix so session ids never
    # collide with unrelated keys in the shared cache.
    assert f"{SESSION_KEY_PREFIX}{session_id}" == _session_key(session_id)


async def test_lookup_missing_returns_none(redis_client: Redis) -> None:
    store = SessionStore(redis_client)
    assert await store.lookup(f"missing-{uuid4()}") is None


async def test_delete_removes_record(redis_client: Redis) -> None:
    store = SessionStore(redis_client)
    session_id = f"sess-del-{uuid4()}"

    await store.record(
        session_id,
        tenant_id=str(TENANT_A),
        subject_id="subj-1",
        server_slug="demo",
    )
    assert await store.lookup(session_id) is not None

    await store.delete(session_id)
    assert await store.lookup(session_id) is None


async def test_matches_requires_all_dimensions(redis_client: Redis) -> None:
    store = SessionStore(redis_client)
    session_id = f"sess-match-{uuid4()}"

    await store.record(
        session_id,
        tenant_id=str(TENANT_A),
        subject_id="subj-1",
        server_slug="demo",
    )
    record = await store.lookup(session_id)
    assert record is not None

    assert matches(record, tenant_id=TENANT_A, subject_id="subj-1", server_slug="demo")
    assert not matches(record, tenant_id=TENANT_B, subject_id="subj-1", server_slug="demo")
    assert not matches(record, tenant_id=TENANT_A, subject_id="subj-2", server_slug="demo")
    assert not matches(record, tenant_id=TENANT_A, subject_id="subj-1", server_slug="other")
