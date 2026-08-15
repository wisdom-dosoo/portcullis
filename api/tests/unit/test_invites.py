"""Unit tests for invitation minting, registration flows, and approval."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.main import create_app
from app.models.orm import (
    InvitationStatus,
    SubjectType,
    UserApprovalStatus,
)

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC)


def _make_admin_subject() -> Subject:
    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_app_with_auth_overrides() -> FastAPI:
    """Create the app with both auth dependencies overridden to an admin."""
    app = create_app()

    mock_runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    app.state.runtime = mock_runtime
    app.state.monitor = AsyncMock()

    _admin = _make_admin_subject()
    app.dependency_overrides[admin_subject] = lambda: _admin
    app.dependency_overrides[authenticated_subject] = lambda: _admin
    return app


def _make_orm_user(
    user_id: UUID | None = None,
    approval_status: UserApprovalStatus = UserApprovalStatus.PENDING,
) -> MagicMock:
    obj = MagicMock()
    obj.id = user_id or UUID("00000000-0000-0000-0000-0000000000ab")
    obj.tenant_id = DEFAULT_TENANT_ID
    obj.email = "jane@company.com"
    obj.full_name = "Jane Smith"
    obj.org_name = "Acme"
    obj.intended_use = "Developer tooling"
    obj.password_hash = "$argon2id$dummy"
    obj.is_active = approval_status is UserApprovalStatus.APPROVED
    obj.approval_status = approval_status
    obj.access_token = None
    obj.created_at = NOW
    obj.updated_at = NOW
    return obj


def _make_orm_invitation(
    invite_id: UUID | None = None,
    status: InvitationStatus = InvitationStatus.ACTIVE,
) -> MagicMock:
    obj = MagicMock()
    obj.id = invite_id or UUID("00000000-0000-0000-0000-0000000000aa")
    obj.tenant_id = DEFAULT_TENANT_ID
    obj.created_by = UUID("00000000-0000-0000-0000-0000000000cd")
    obj.org_name = "Acme"
    obj.email = None
    obj.code_hash = "abcd" * 16
    obj.status = status
    obj.redeemed_by = None
    obj.redeemed_at = None
    obj.expires_at = None
    obj.created_at = NOW
    obj.code = None
    return obj


# ---------------------------------------------------------------------------
# POST /auth/register — flow handling
# ---------------------------------------------------------------------------


class TestRegisterFlows:
    @pytest.mark.asyncio
    async def test_register_join_creates_pending_user_without_token(self) -> None:
        app = _make_app_with_auth_overrides()
        user = _make_orm_user()
        create_calls: list = []

        with (
            patch("app.api.auth.UserRepository") as MockUsers,
            patch("app.api.auth.PasswordService") as MockPasswords,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)
            mock_users.create = AsyncMock(
                side_effect=lambda **kwargs: create_calls.append(kwargs) or user
            )

            passwords = MockPasswords.return_value
            passwords.hash_password = MagicMock(return_value="hash")

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "full_name": "Jane Smith",
                        "email": "jane@company.com",
                        "password": "hunter2strong",
                        "flow": "join",
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["access_token"] == ""
        assert body["user"]["approval_status"] == "pending"
        assert create_calls[0]["approval_status"] is UserApprovalStatus.PENDING

    @pytest.mark.asyncio
    async def test_register_invitation_redeems_code_and_returns_token(self) -> None:
        app = _make_app_with_auth_overrides()
        user = _make_orm_user(approval_status=UserApprovalStatus.APPROVED)
        invitation = _make_orm_invitation()
        plaintext = "pk_abcdefgh_" + "b" * 43

        with (
            patch("app.api.auth.UserRepository") as MockUsers,
            patch("app.api.auth.InvitationRepository") as MockInvitations,
            patch("app.api.auth.InviteService") as MockInvites,
            patch("app.api.auth.issue_key", new_callable=AsyncMock) as mock_issue,
            patch("app.api.auth.PasswordService") as MockPasswords,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)
            mock_users.create = AsyncMock(return_value=user)

            mock_invites = MockInvites.return_value
            mock_invites.find_active = AsyncMock(return_value=invitation)

            mock_invitations = MockInvitations.return_value
            mock_invitations.mark_redeemed = AsyncMock(return_value=True)

            passwords = MockPasswords.return_value
            passwords.hash_password = MagicMock(return_value="hash")

            mock_issue.return_value = MagicMock(plaintext=plaintext, scopes=frozenset())

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "full_name": "Jane Smith",
                        "email": "jane@company.com",
                        "password": "hunter2strong",
                        "flow": "invitation",
                        "invite_code": "XXXX-XXXX-XXXX",
                    },
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["access_token"] == plaintext
        assert body["user"]["approval_status"] == "approved"
        mock_invites.find_active.assert_awaited_once()
        mock_invitations.mark_redeemed.assert_awaited_once_with(invitation.id, user.id)

    @pytest.mark.asyncio
    async def test_register_invitation_bad_code_returns_401(self) -> None:
        from app.auth.invites import InviteLookupError

        app = _make_app_with_auth_overrides()

        with (
            patch("app.api.auth.UserRepository") as MockUsers,
            patch("app.api.auth.InviteService") as MockInvites,
            patch("app.api.auth.PasswordService") as MockPasswords,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)
            mock_users.create = AsyncMock(return_value=None)

            mock_invites = MockInvites.return_value
            mock_invites.find_active = AsyncMock(side_effect=InviteLookupError("bad"))

            passwords = MockPasswords.return_value
            passwords.hash_password = MagicMock(return_value="hash")

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "full_name": "Jane Smith",
                        "email": "jane@company.com",
                        "password": "hunter2strong",
                        "flow": "invitation",
                        "invite_code": "XXXX-XXXX-XXXX",
                    },
                )

        assert resp.status_code == 401
        assert mock_users.create.await_count == 0

    @pytest.mark.asyncio
    async def test_register_invitation_missing_code_returns_422(self) -> None:
        app = _make_app_with_auth_overrides()

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.get_by_email = AsyncMock(return_value=None)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "full_name": "Jane Smith",
                        "email": "jane@company.com",
                        "password": "hunter2strong",
                        "flow": "invitation",
                    },
                )

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/invites
# ---------------------------------------------------------------------------


class TestCreateInvite:
    @pytest.mark.asyncio
    async def test_create_invite_returns_plaintext_code(self) -> None:
        app = _make_app_with_auth_overrides()
        invitation = _make_orm_invitation()

        with (
            patch("app.api.auth.InviteService") as MockInvites,
            patch("app.api.auth.ApiKeyRepository") as MockKeys,
        ):
            mock_keys = MockKeys.return_value
            mock_keys.get_by_id = AsyncMock(return_value=MagicMock(user_id=invitation.created_by))

            mock_invites = MockInvites.return_value
            mock_invites.mint = AsyncMock(return_value=(invitation, "XXXX-XXXX-XXXX"))

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/invites",
                    json={"org_name": "Acme", "expires_in_days": 30},
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["code"] == "XXXX-XXXX-XXXX"
        assert body["org_name"] == "Acme"
        mock_invites.mint.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_invite_invalid_org_returns_422(self) -> None:
        app = _make_app_with_auth_overrides()

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/auth/invites", json={"org_name": ""})

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /auth/invites and revoke
# ---------------------------------------------------------------------------


class TestInviteListAndRevoke:
    @pytest.mark.asyncio
    async def test_list_invites_returns_invitations(self) -> None:
        from app.api.dependencies import get_session

        app = _make_app_with_auth_overrides()
        invitation = _make_orm_invitation()

        with patch("app.api.auth.InvitationRepository") as MockInvitations:
            mock_invitations = MockInvitations.return_value
            mock_invitations.list = AsyncMock(return_value=[invitation])

            mock_session = AsyncMock()
            counter = iter([mock_session, mock_session])

            async def fake_session():
                return next(counter)

            app.dependency_overrides[get_session] = fake_session

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/auth/invites")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["id"] == str(invitation.id)

    @pytest.mark.asyncio
    async def test_revoke_invite_returns_204(self) -> None:
        app = _make_app_with_auth_overrides()
        invite_id = UUID("00000000-0000-0000-0000-0000000000aa")

        with patch("app.api.auth.InvitationRepository") as MockInvitations:
            mock_invitations = MockInvitations.return_value
            mock_invitations.revoke = AsyncMock(return_value=True)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/auth/invites/{invite_id}/revoke")

        assert resp.status_code == 204
        mock_invitations.revoke.assert_awaited_once_with(invite_id, DEFAULT_TENANT_ID)

    @pytest.mark.asyncio
    async def test_revoke_missing_invite_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        invite_id = UUID("00000000-0000-0000-0000-0000000000aa")

        with patch("app.api.auth.InvitationRepository") as MockInvitations:
            mock_invitations = MockInvitations.return_value
            mock_invitations.revoke = AsyncMock(return_value=False)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/auth/invites/{invite_id}/revoke")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /auth/pending-users approval
# ---------------------------------------------------------------------------


class TestPendingUsers:
    @pytest.mark.asyncio
    async def test_list_pending_users(self) -> None:
        app = _make_app_with_auth_overrides()
        user = _make_orm_user()

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.list_by_status = AsyncMock(return_value=[user])

            mock_session = AsyncMock()
            counter = iter([mock_session, mock_session])

            async def fake_session():
                return next(counter)

            from app.api.dependencies import get_session

            app.dependency_overrides[get_session] = fake_session

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/auth/pending-users")

        assert resp.status_code == 200
        body = resp.json()
        assert body[0]["email"] == "jane@company.com"
        assert body[0]["approval_status"] == "pending"

    @pytest.mark.asyncio
    async def test_approve_user_returns_token(self) -> None:
        app = _make_app_with_auth_overrides()
        user_id = UUID("00000000-0000-0000-0000-0000000000ab")
        user = _make_orm_user(approval_status=UserApprovalStatus.APPROVED)
        plaintext = "pk_abcdefgh_" + "d" * 43

        with (
            patch("app.api.auth.UserRepository") as MockUsers,
            patch("app.api.auth.issue_key", new_callable=AsyncMock) as mock_issue,
        ):
            mock_users = MockUsers.return_value
            mock_users.get_by_id = AsyncMock(return_value=user)
            mock_users.set_approval_status = AsyncMock(return_value=True)

            mock_issue.return_value = MagicMock(plaintext=plaintext, scopes=frozenset())

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/auth/pending-users/{user_id}/approve",
                    json={"user_id": str(user_id)},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["access_token"] == plaintext
        assert body["approval_status"] == "approved"
        mock_users.set_approval_status.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_approve_user_id_mismatch_returns_422(self) -> None:
        app = _make_app_with_auth_overrides()
        user_id = UUID("00000000-0000-0000-0000-0000000000ab")

        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/auth/pending-users/{user_id}/approve",
                json={"user_id": str(UUID("00000000-0000-0000-0000-0000000000bb"))},
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_reject_user_returns_204(self) -> None:
        app = _make_app_with_auth_overrides()
        user_id = UUID("00000000-0000-0000-0000-0000000000ab")

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.set_approval_status = AsyncMock(return_value=True)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/auth/pending-users/{user_id}/reject")

        assert resp.status_code == 204
        mock_users.set_approval_status.assert_awaited_once_with(
            DEFAULT_TENANT_ID, user_id, UserApprovalStatus.REJECTED
        )

    @pytest.mark.asyncio
    async def test_reject_missing_user_returns_404(self) -> None:
        app = _make_app_with_auth_overrides()
        user_id = UUID("00000000-0000-0000-0000-0000000000ab")

        with patch("app.api.auth.UserRepository") as MockUsers:
            mock_users = MockUsers.return_value
            mock_users.set_approval_status = AsyncMock(return_value=False)

            transport = ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/auth/pending-users/{user_id}/reject")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# InviteService unit tests
# ---------------------------------------------------------------------------


class TestInviteService:
    @pytest.mark.asyncio
    async def test_mint_and_find_active_roundtrip(self) -> None:
        from app.auth.invites import InviteService

        invite_id = UUID("00000000-0000-0000-0000-0000000000aa")
        invitation = _make_orm_invitation()

        with (
            patch("app.auth.invites.InvitationRepository") as MockInvitations,
        ):
            mock_invitations = MockInvitations.return_value
            mock_invitations.create = AsyncMock(return_value=invitation)
            mock_invitations.get_by_code_hash = AsyncMock(return_value=invitation)

            mock_session = AsyncMock()
            service = InviteService()

            _, code = await service.mint(
                session=mock_session,
                tenant_id=DEFAULT_TENANT_ID,
                org_name="Acme",
                pepper="test-pepper",
            )

            # The generated code must be in the dashed alphabet format.
            assert len(code) == 14
            assert code[4] == "-" and code[9] == "-"

            # find_active must resolve the same invitation via its hash.
            found = await service.find_active(
                session=mock_session,
                tenant_id=DEFAULT_TENANT_ID,
                code=code,
                pepper="test-pepper",
            )
            assert found.id == invite_id
            mock_invitations.get_by_code_hash.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_find_active_rejects_used_invite(self) -> None:
        from app.auth.invites import InviteLookupError, InviteService

        invitation = _make_orm_invitation(status=InvitationStatus.USED)

        with patch("app.auth.invites.InvitationRepository") as MockInvitations:
            mock_invitations = MockInvitations.return_value
            mock_invitations.get_by_code_hash = AsyncMock(return_value=invitation)

            service = InviteService()
            with pytest.raises(InviteLookupError):
                await service.find_active(
                    session=AsyncMock(),
                    tenant_id=DEFAULT_TENANT_ID,
                    code="XXXX-XXXX-XXXX",
                    pepper="test-pepper",
                )

    @pytest.mark.asyncio
    async def test_find_active_rejects_expired_invite(self) -> None:
        from app.auth.invites import InviteLookupError, InviteService

        invitation = _make_orm_invitation()
        invitation.expires_at = NOW - timedelta(days=1)

        with patch("app.auth.invites.InvitationRepository") as MockInvitations:
            mock_invitations = MockInvitations.return_value
            mock_invitations.get_by_code_hash = AsyncMock(return_value=invitation)

            service = InviteService()
            with pytest.raises(InviteLookupError):
                await service.find_active(
                    session=AsyncMock(),
                    tenant_id=DEFAULT_TENANT_ID,
                    code="XXXX-XXXX-XXXX",
                    pepper="test-pepper",
                )

    @pytest.mark.asyncio
    async def test_find_active_rejects_unknown_code(self) -> None:
        from app.auth.invites import InviteLookupError, InviteService

        with patch("app.auth.invites.InvitationRepository") as MockInvitations:
            mock_invitations = MockInvitations.return_value
            mock_invitations.get_by_code_hash = AsyncMock(return_value=None)

            service = InviteService()
            with pytest.raises(InviteLookupError):
                await service.find_active(
                    session=AsyncMock(),
                    tenant_id=DEFAULT_TENANT_ID,
                    code="XXXX-XXXX-XXXX",
                    pepper="test-pepper",
                )

    @pytest.mark.asyncio
    async def test_normalize_code_accepts_dashed_and_compact(self) -> None:
        from app.auth.invites import normalize_code

        assert normalize_code("abcd-efgh-jklm") == "ABCDEFGHJKLM"
        assert normalize_code("abcdefghjklm") == "ABCDEFGHJKLM"
        with pytest.raises(ValueError):
            normalize_code("not-a-code!")
