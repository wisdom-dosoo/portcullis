"""Integration: portcullis admin bootstrap against a real database."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import PasswordService
from app.cli import _bootstrap_admin
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import AuditEventType, UserApprovalStatus
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository

PEPPER = "development-only-change-me"


@pytest.mark.integration
async def test_bootstrap_promotes_user_and_audits(
    async_session: AsyncSession,
    capsys: pytest.CaptureFixture[str],
) -> None:
    passwords = PasswordService(PEPPER)
    repo = UserRepository(async_session)
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email="owner@example.com",
        password_hash=passwords.hash_password("password-123"),
        full_name="Owner",
        org_name="Acme",
        intended_use="admin",
        approval_status=UserApprovalStatus.APPROVED,
    )
    await async_session.commit()

    await _bootstrap_admin("owner@example.com")

    out = capsys.readouterr().out.strip()
    assert out.startswith("pk_")

    await async_session.expire_all()
    promoted = await repo.get_by_email(DEFAULT_TENANT_ID, "owner@example.com")
    assert promoted is not None
    assert promoted.is_platform_admin is True

    audit = AuditRepository(async_session)
    events = await audit.list(
        DEFAULT_TENANT_ID,
        event_type=AuditEventType.PLATFORM_ADMIN_GRANTED,
    )
    assert any(
        e.subject_id == str(user.id) and e.detail.get("email") == "owner@example.com"
        for e in events
    )


@pytest.mark.integration
async def test_bootstrap_is_idempotent(
    async_session: AsyncSession,
    capsys: pytest.CaptureFixture[str],
) -> None:
    passwords = PasswordService(PEPPER)
    repo = UserRepository(async_session)
    await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email="again@example.com",
        password_hash=passwords.hash_password("password-123"),
        full_name="Again",
        org_name="Acme",
        intended_use="admin",
        approval_status=UserApprovalStatus.APPROVED,
    )
    await async_session.commit()

    await _bootstrap_admin("again@example.com")
    await _bootstrap_admin("again@example.com")

    captured = capsys.readouterr().out.strip().splitlines()
    assert len(captured) == 2
    assert all(line.startswith("pk_") for line in captured)

    await async_session.expire_all()
    promoted = await repo.get_by_email(DEFAULT_TENANT_ID, "again@example.com")
    assert promoted is not None
    assert promoted.is_platform_admin is True
