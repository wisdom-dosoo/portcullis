"""Unit tests for the /v1/roles API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport

from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import PermissionEffect, SubjectType

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)


def _make_admin_subject() -> Subject:
    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_non_admin_subject() -> Subject:
    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset([]),
    )


def _make_app_with_auth_overrides(
    admin_sub: Subject | None = None,
    auth_sub: Subject | None = None,
) -> FastAPI:
    """Create the app with auth dependencies overridden."""
    app = create_app()

    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()

    _admin = admin_sub or _make_admin_subject()
    _auth = auth_sub or _make_admin_subject()

    app.dependency_overrides[admin_subject] = lambda: _admin
    app.dependency_overrides[authenticated_subject] = lambda: _auth

    return app


def _make_fake_role(role_id: UUID | None = None, name: str = "test-role") -> MagicMock:
    obj = MagicMock()
    obj.id = role_id or uuid4()
    obj.name = name
    obj.tenant_id = DEFAULT_TENANT_ID
    obj.created_at = NOW
    return obj


def _make_fake_binding(
    binding_id: UUID | None = None,
    role_id: UUID | None = None,
    subject_id: UUID | None = None,
) -> MagicMock:
    obj = MagicMock()
    obj.id = binding_id or uuid4()
    obj.role_id = role_id or uuid4()
    obj.subject_type = SubjectType.API_KEY
    # subject_id is TEXT in v0.2 — store as string so RoleBindingView validates
    obj.subject_id = str(subject_id or uuid4())
    obj.created_at = NOW
    return obj


def _make_fake_permission(
    perm_id: UUID | None = None,
    role_id: UUID | None = None,
) -> MagicMock:
    obj = MagicMock()
    obj.id = perm_id or uuid4()
    obj.role_id = role_id or uuid4()
    obj.server_pattern = "my-server"
    obj.tool_pattern = "my_tool"
    obj.effect = PermissionEffect.ALLOW
    obj.priority = 0
    obj.created_at = NOW
    return obj


# ---------------------------------------------------------------------------
# POST /v1/roles — create role
# ---------------------------------------------------------------------------


class TestCreateRole:
    @pytest.mark.asyncio
    async def test_create_role_returns_201(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        fake_role = _make_fake_role(role_id=role_id)

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.create_role = AsyncMock(return_value=fake_role)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post("/v1/roles", json={"name": "test-role"})

        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "test-role"
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_create_role_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session = AsyncMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/v1/roles", json={"name": "test-role"})

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/roles — list roles
# ---------------------------------------------------------------------------


class TestListRoles:
    @pytest.mark.asyncio
    async def test_list_roles_returns_200(self) -> None:
        app = _make_app_with_auth_overrides()
        roles = [_make_fake_role(name="role-a"), _make_fake_role(name="role-b")]

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list_roles = AsyncMock(return_value=roles)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/roles")

        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2
        names = {item["name"] for item in body}
        assert names == {"role-a", "role-b"}

    @pytest.mark.asyncio
    async def test_list_roles_empty_returns_empty_list(self) -> None:
        app = _make_app_with_auth_overrides()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.list_roles = AsyncMock(return_value=[])

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/v1/roles")

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_roles_requires_authentication(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session = AsyncMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/v1/roles")

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /v1/roles/{role_id}/bindings — create binding
# ---------------------------------------------------------------------------


class TestCreateBinding:
    @pytest.mark.asyncio
    async def test_create_binding_returns_201(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        subject_id = uuid4()
        fake_role = _make_fake_role(role_id=role_id)
        fake_binding = _make_fake_binding(role_id=role_id, subject_id=subject_id)

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_role = AsyncMock(return_value=fake_role)
            instance.create_binding = AsyncMock(return_value=fake_binding)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/v1/roles/{role_id}/bindings",
                    json={"subject_id": str(subject_id)},
                )

        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert "role_id" in body
        assert "subject_id" in body

    @pytest.mark.asyncio
    async def test_create_binding_unknown_role_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        subject_id = uuid4()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_role = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/v1/roles/{role_id}/bindings",
                    json={"subject_id": str(subject_id)},
                )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_binding_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        role_id = uuid4()
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/v1/roles/{role_id}/bindings",
                json={"subject_id": str(uuid4())},
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /v1/roles/{role_id}/bindings/{binding_id} — delete binding
# ---------------------------------------------------------------------------


class TestDeleteBinding:
    @pytest.mark.asyncio
    async def test_delete_binding_returns_204(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        binding_id = uuid4()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.delete_binding = AsyncMock(return_value=True)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/roles/{role_id}/bindings/{binding_id}")

        assert resp.status_code == 204
        assert resp.content == b""

    @pytest.mark.asyncio
    async def test_delete_binding_not_found_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        binding_id = uuid4()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.delete_binding = AsyncMock(return_value=False)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/roles/{role_id}/bindings/{binding_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_binding_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(f"/v1/roles/{uuid4()}/bindings/{uuid4()}")

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/roles/{role_id}/permissions — create permission
# ---------------------------------------------------------------------------


class TestCreatePermission:
    @pytest.mark.asyncio
    async def test_create_permission_returns_201(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        fake_role = _make_fake_role(role_id=role_id)
        fake_perm = _make_fake_permission(role_id=role_id)

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_role = AsyncMock(return_value=fake_role)
            instance.create_permission = AsyncMock(return_value=fake_perm)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/v1/roles/{role_id}/permissions",
                    json={
                        "server_pattern": "my-server",
                        "tool_pattern": "my_tool",
                        "effect": "allow",
                        "priority": 0,
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert "role_id" in body
        assert body["server_pattern"] == "my-server"
        assert body["tool_pattern"] == "my_tool"
        assert body["effect"] == "allow"

    @pytest.mark.asyncio
    async def test_create_permission_unknown_role_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_role = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/v1/roles/{role_id}/permissions",
                    json={
                        "server_pattern": "my-server",
                        "tool_pattern": "my_tool",
                        "effect": "allow",
                    },
                )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_permission_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/v1/roles/{uuid4()}/permissions",
                json={
                    "server_pattern": "my-server",
                    "tool_pattern": "my_tool",
                    "effect": "allow",
                },
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /v1/roles/{role_id}/permissions/{permission_id} — delete permission
# ---------------------------------------------------------------------------


class TestDeletePermission:
    @pytest.mark.asyncio
    async def test_delete_permission_returns_204(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        perm_id = uuid4()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.delete_permission = AsyncMock(return_value=True)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/roles/{role_id}/permissions/{perm_id}")

        assert resp.status_code == 204
        assert resp.content == b""

    @pytest.mark.asyncio
    async def test_delete_permission_not_found_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        role_id = uuid4()
        perm_id = uuid4()

        with patch("app.api.roles.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.delete_permission = AsyncMock(return_value=False)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(f"/v1/roles/{role_id}/permissions/{perm_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_permission_non_admin_returns_403(self) -> None:
        app = create_app()
        mock_runtime = MagicMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
        app.state.runtime = mock_runtime
        app.state.monitor = AsyncMock()

        app.dependency_overrides[admin_subject] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin scope required")
        )

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(f"/v1/roles/{uuid4()}/permissions/{uuid4()}")

        assert resp.status_code == 403
