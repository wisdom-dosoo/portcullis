"""Unit tests for seat-limit enforcement on member creation and invites."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import admin_subject, authenticated_subject, platform_admin_subject
from app.auth.licenses import LicenseEntitlementError
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import OrgRole, SubjectType

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


def _make_subject() -> Subject:
    return Subject(
        subject_id=str(UUID("00000000-0000-0000-0000-0000000000cd")),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_app() -> FastAPI:
    app = create_app()
    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()
    return app


@pytest.mark.asyncio
async def test_create_member_enforces_seat_limit() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()
    app.dependency_overrides[admin_subject] = lambda: _make_subject()

    member_repo = MagicMock()
    member_repo.get_by_subject = AsyncMock(return_value=None)
    member_repo.count = AsyncMock(return_value=5)

    with (
        patch("app.api.auth.OrgMemberRepository", return_value=member_repo),
        patch(
            "app.api.auth.require_license",
            new_callable=AsyncMock,
            side_effect=LicenseEntitlementError("seat limit exceeded (6 > 5)"),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/auth/members",
                json={"user_subject": "sub-99", "admin_role": "viewer"},
            )

    assert response.status_code == 402
    assert "seat limit exceeded" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_member_allows_within_seat_limit() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()
    app.dependency_overrides[admin_subject] = lambda: _make_subject()

    member_repo = MagicMock()
    member_repo.get_by_subject = AsyncMock(return_value=None)
    member_repo.count = AsyncMock(return_value=4)
    member_repo.create = AsyncMock(
        return_value=MagicMock(
            id=UUID("00000000-0000-0000-0000-0000000000ee"),
            tenant_id=DEFAULT_TENANT_ID,
            user_subject="sub-99",
            admin_role=OrgRole.VIEWER.value,
            team_id=None,
        )
    )
    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session

    current_member = MagicMock()
    current_member.admin_role = OrgRole.ORG_OWNER.value

    with (
        patch("app.api.auth.OrgMemberRepository", return_value=member_repo),
        patch(
            "app.api.auth._get_current_org_member",
            new_callable=AsyncMock,
            return_value=current_member,
        ),
        patch("app.api.auth.require_license", new_callable=AsyncMock),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/auth/members",
                json={"user_subject": "sub-99", "admin_role": "viewer"},
            )

    assert response.status_code == 201
    member_repo.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_invite_redemption_enforces_seat_limit() -> None:
    app = _make_app()
    app.dependency_overrides[get_settings_dep] = lambda: MagicMock()
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[authenticated_subject] = lambda: _make_subject()
    app.dependency_overrides[platform_admin_subject] = lambda: _make_subject()

    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session

    user_repo = MagicMock()
    user_repo.get_by_email = AsyncMock(return_value=None)
    user_repo.count = AsyncMock(return_value=5)

    invitation = MagicMock()
    invitation.email = "ada@example.com"
    invitation.org_name = "Acme"

    with (
        patch("app.api.auth.UserRepository", return_value=user_repo),
        patch(
            "app.api.auth.InviteService",
            return_value=MagicMock(find_active=AsyncMock(return_value=invitation)),
        ),
        patch(
            "app.api.auth.require_license",
            new_callable=AsyncMock,
            side_effect=LicenseEntitlementError("seat limit exceeded (6 > 5)"),
        ),
        patch(
            "app.api.auth.PasswordService",
            return_value=MagicMock(hash_password=lambda pw: "hash"),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.post(
                "/auth/register",
                json={
                    "email": "ada@example.com",
                    "password": "str0ng-pass",
                    "full_name": "Ada",
                    "flow": "invitation",
                    "invite_code": "invite-1",
                },
            )

    assert response.status_code == 402
    assert "seat limit exceeded" in response.json()["detail"]