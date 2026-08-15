"""Integration tests for the ServerRepository against a real Postgres container."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import PermissionEffect, ServerStatus, SubjectType
from app.models.schemas import ServerCreate, ServerUpdate
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository

TENANT_A = UUID("00000000-0000-0000-0000-000000000001")
TENANT_B = UUID("00000000-0000-0000-0000-000000000002")


def _create_payload(slug: str, *, name: str = "Test Server") -> ServerCreate:
    return ServerCreate(
        name=name,
        slug=slug,
        upstream_url="https://mcp.internal/mcp",
    )


async def test_create_and_retrieve_by_slug(async_session: AsyncSession) -> None:
    repo = ServerRepository(async_session)
    server = await repo.create(TENANT_A, _create_payload("new-server"))
    await async_session.commit()

    found = await repo.get_by_slug(TENANT_A, "new-server")
    assert found is not None
    assert found.id == server.id
    assert found.status == ServerStatus.ACTIVE


async def test_list_returns_only_tenant_servers(async_session: AsyncSession) -> None:
    repo = ServerRepository(async_session)
    await repo.create(TENANT_A, _create_payload("tenant-a-server"))
    await repo.create(TENANT_B, _create_payload("tenant-b-server"))
    await async_session.commit()

    servers_a = await repo.list(TENANT_A)
    assert [s.slug for s in servers_a] == ["tenant-a-server"]


async def test_update_applies_only_provided_fields(async_session: AsyncSession) -> None:
    repo = ServerRepository(async_session)
    server = await repo.create(TENANT_A, _create_payload("updatable-server", name="Original"))
    await async_session.commit()

    updated = await repo.update(server, ServerUpdate(name="Renamed"))
    await async_session.commit()

    assert updated.name == "Renamed"
    assert updated.slug == "updatable-server"
    assert updated.upstream_url == "https://mcp.internal/mcp"


async def test_update_status_to_disabled(async_session: AsyncSession) -> None:
    repo = ServerRepository(async_session)
    server = await repo.create(TENANT_A, _create_payload("disable-me"))
    await async_session.commit()

    await repo.update(server, ServerUpdate(status=ServerStatus.DISABLED))
    await async_session.commit()

    found = await repo.get_by_slug(TENANT_A, "disable-me")
    assert found is not None
    assert found.status == ServerStatus.DISABLED


async def test_delete_removes_server(async_session: AsyncSession) -> None:
    repo = ServerRepository(async_session)
    server = await repo.create(TENANT_A, _create_payload("delete-me"))
    await async_session.commit()

    await repo.delete(server)
    await async_session.commit()

    assert await repo.get_by_slug(TENANT_A, "delete-me") is None


async def test_delete_exact_slug_permissions_removes_exact_matches(
    async_session: AsyncSession,
) -> None:
    """Deleting exact-slug rules must not remove wildcard rules."""
    server_repo = ServerRepository(async_session)
    rbac_repo = RbacRepository(async_session)

    await server_repo.create(TENANT_A, _create_payload("delete-wildcard-me"))
    role = await rbac_repo.create_role(TENANT_A, "permissions-role")
    await rbac_repo.create_permission(
        role_id=role.id,
        server_pattern="delete-wildcard-me",
        tool_pattern="*",
        effect=PermissionEffect.ALLOW,
        priority=0,
    )
    await rbac_repo.create_permission(
        role_id=role.id,
        server_pattern="*",
        tool_pattern="*",
        effect=PermissionEffect.ALLOW,
        priority=10,
    )
    await async_session.commit()

    await server_repo.delete_exact_slug_permissions(TENANT_A, "delete-wildcard-me")
    await async_session.commit()

    perms = await rbac_repo.get_permissions_for_subject(
        TENANT_A,
        subject_type=SubjectType.API_KEY,
        subject_id="deadbeef-0000-0000-0000-000000000001",
    )
    patterns = {p.server_pattern for p in perms}
    assert "delete-wildcard-me" not in patterns
    assert "*" in patterns


async def test_slug_uniqueness_within_tenant(async_session: AsyncSession) -> None:
    """Two servers with the same tenant+slug must violate the unique constraint."""
    repo = ServerRepository(async_session)
    await repo.create(TENANT_A, _create_payload("unique-slug"))
    await async_session.commit()

    await repo.create(TENANT_A, _create_payload("unique-slug"))
    with pytest.raises(IntegrityError):
        await async_session.commit()
    await async_session.rollback()
