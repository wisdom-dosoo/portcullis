"""Integration tests for the ApiKeyRepository against a real Postgres container."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.api_keys import ApiKeyRepository

TENANT_A = UUID("00000000-0000-0000-0000-000000000001")
TENANT_B = UUID("00000000-0000-0000-0000-000000000002")


async def test_create_then_get_by_prefix(async_session: AsyncSession) -> None:
    """A created key must be retrievable by its prefix while active."""
    repo = ApiKeyRepository(async_session)
    key = await repo.create(
        tenant_id=TENANT_A,
        name="ci-key",
        key_prefix="pk_citest_a_",
        key_hash="hash-1",
        scopes=["admin"],
    )
    await async_session.commit()

    found = await repo.get_by_prefix("pk_citest_a_")
    assert found is not None
    assert found.id == key.id
    assert found.tenant_id == TENANT_A
    assert found.scopes == ["admin"]


async def test_revoked_key_not_returned(async_session: AsyncSession) -> None:
    """list_active and get_by_prefix must exclude revoked keys."""
    repo = ApiKeyRepository(async_session)
    key = await repo.create(
        tenant_id=TENANT_A,
        name="revocable",
        key_prefix="pk_citest_b_",
        key_hash="hash-2",
        scopes=[],
    )
    await async_session.commit()

    assert await repo.revoke(key.id, TENANT_A) is True
    await async_session.commit()

    assert await repo.get_by_prefix("pk_citest_b_") is None
    assert all(k.id != key.id for k in await repo.list_active(TENANT_A))


async def test_list_active_scoped_to_tenant(async_session: AsyncSession) -> None:
    """list_active must only return keys belonging to the requested tenant."""
    repo = ApiKeyRepository(async_session)
    await repo.create(
        tenant_id=TENANT_A,
        name="tenant-a-key",
        key_prefix="pk_citest_c_",
        key_hash="hash-3",
        scopes=[],
    )
    await repo.create(
        tenant_id=TENANT_B,
        name="tenant-b-key",
        key_prefix="pk_citest_d_",
        key_hash="hash-4",
        scopes=[],
    )
    await async_session.commit()

    keys_a = await repo.list_active(TENANT_A)
    assert len(keys_a) == 1
    assert keys_a[0].name == "tenant-a-key"


async def test_revoke_foreign_key_returns_false(async_session: AsyncSession) -> None:
    """Revoking a key that belongs to another tenant must not silently succeed."""
    repo = ApiKeyRepository(async_session)
    key = await repo.create(
        tenant_id=TENANT_A,
        name="tenant-a-only",
        key_prefix="pk_citest_e_",
        key_hash="hash-5",
        scopes=[],
    )
    await async_session.commit()

    assert await repo.revoke(key.id, TENANT_B) is False
    await async_session.commit()

    # Still active in tenant A.
    assert await repo.get_by_prefix("pk_citest_e_") is not None


async def test_update_last_used_stamps_timestamp(async_session: AsyncSession) -> None:
    """update_last_used must refresh the last_used_at column."""
    repo = ApiKeyRepository(async_session)
    key = await repo.create(
        tenant_id=TENANT_A,
        name="usage-tracked",
        key_prefix="pk_citest_f_",
        key_hash="hash-6",
        scopes=[],
    )
    await async_session.commit()

    await repo.update_last_used(key.id)
    await async_session.commit()
    await async_session.refresh(key)

    assert key.last_used_at is not None
    assert key.last_used_at <= datetime.now(UTC)
