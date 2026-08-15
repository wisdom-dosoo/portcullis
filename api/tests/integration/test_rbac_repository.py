"""Integration tests for the RbacRepository against a real Postgres container."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import PermissionEffect, SubjectType
from app.repositories.rbac import RbacRepository

TENANT_A = UUID("00000000-0000-0000-0000-000000000001")
TENANT_B = UUID("00000000-0000-0000-0000-000000000002")


async def _build_role_with_permission(
    session: AsyncSession,
    repo: RbacRepository,
    tenant_id: UUID,
    subject_id: str,
    subject_type: SubjectType,
    server_pattern: str,
) -> None:
    role = await repo.create_role(tenant_id, f"role-{server_pattern}")
    await repo.create_permission(
        role_id=role.id,
        server_pattern=server_pattern,
        tool_pattern="*",
        effect=PermissionEffect.ALLOW,
        priority=0,
    )
    await repo.create_binding(
        role_id=role.id,
        subject_id=subject_id,
        subject_type=subject_type,
    )
    await session.commit()


async def test_permissions_scoped_by_tenant(async_session: AsyncSession) -> None:
    """A subject bound in tenant A must not inherit permissions from tenant B."""
    repo = RbacRepository(async_session)
    subject_id = "aaaaaaaa-0000-0000-0000-000000000001"

    await _build_role_with_permission(
        async_session, repo, TENANT_A, subject_id, SubjectType.API_KEY, "server-a"
    )
    await _build_role_with_permission(
        async_session, repo, TENANT_B, subject_id, SubjectType.API_KEY, "server-b"
    )

    perms_a = await repo.get_permissions_for_subject(TENANT_A, SubjectType.API_KEY, subject_id)
    patterns_a = {p.server_pattern for p in perms_a}
    assert patterns_a == {"server-a"}

    perms_b = await repo.get_permissions_for_subject(TENANT_B, SubjectType.API_KEY, subject_id)
    patterns_b = {p.server_pattern for p in perms_b}
    assert patterns_b == {"server-b"}


async def test_permissions_scoped_by_subject_type(async_session: AsyncSession) -> None:
    """API-key and OAuth subjects sharing a UUID string must not collide."""
    repo = RbacRepository(async_session)
    shared_id = "cccccccc-0000-0000-0000-000000000001"

    await _build_role_with_permission(
        async_session, repo, TENANT_A, shared_id, SubjectType.API_KEY, "server-a"
    )
    await _build_role_with_permission(
        async_session, repo, TENANT_A, shared_id, SubjectType.OAUTH_SUBJECT, "server-b"
    )

    api_perms = await repo.get_permissions_for_subject(TENANT_A, SubjectType.API_KEY, shared_id)
    assert {p.server_pattern for p in api_perms} == {"server-a"}

    oauth_perms = await repo.get_permissions_for_subject(
        TENANT_A, SubjectType.OAUTH_SUBJECT, shared_id
    )
    assert {p.server_pattern for p in oauth_perms} == {"server-b"}


async def test_unknown_subject_has_no_permissions(async_session: AsyncSession) -> None:
    """A subject with no bindings in the tenant must get an empty permission set."""
    repo = RbacRepository(async_session)

    await _build_role_with_permission(
        async_session,
        repo,
        TENANT_A,
        "dddddddd-0000-0000-0000-000000000001",
        SubjectType.API_KEY,
        "server-a",
    )

    perms = await repo.get_permissions_for_subject(
        TENANT_A, SubjectType.API_KEY, "eeeeeeee-0000-0000-0000-000000000001"
    )
    assert perms == []
