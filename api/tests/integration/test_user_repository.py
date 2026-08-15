"""Integration tests for UserRepository — including platform-admin flag."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import UserApprovalStatus
from app.repositories.users import UserRepository

TENANT = UUID("00000000-0000-0000-0000-000000000001")


async def _seed_user(async_session: AsyncSession, email: str) -> UUID:
    repo = UserRepository(async_session)
    user = await repo.create(
        tenant_id=TENANT,
        email=email,
        password_hash="$argon2id$dummy",
        full_name="Test User",
        org_name=None,
        intended_use=None,
        approval_status=UserApprovalStatus.APPROVED,
    )
    await async_session.commit()
    return user.id


async def test_set_platform_admin_flips_flag(async_session: AsyncSession) -> None:
    user_id = await _seed_user(async_session, "owner@example.com")
    repo = UserRepository(async_session)

    assert await repo.set_platform_admin(TENANT, user_id, True) is True
    await async_session.commit()
    await async_session.expire_all()

    user = await repo.get_by_id(TENANT, user_id)
    assert user is not None
    assert user.is_platform_admin is True


async def test_set_platform_admin_false_for_missing_user(
    async_session: AsyncSession,
) -> None:
    repo = UserRepository(async_session)
    missing = UUID("11111111-1111-1111-1111-111111111111")
    assert await repo.set_platform_admin(TENANT, missing, True) is False
