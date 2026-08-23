"""Unit tests for app.provisioning — shared tenant provisioning service."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from app.auth.subject import IssuedKey
from app.models.orm import LicensePlan, OrgRole, UserApprovalStatus
from app.provisioning import ProvisioningError, ProvisioningService

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
OWNER_ID = UUID("00000000-0000-0000-0000-000000000002")
ISSUER_ID = UUID("00000000-0000-0000-0000-0000000000cd")


def _make_settings() -> MagicMock:
    settings = MagicMock()
    settings.api_key_pepper = "test-pepper"
    return settings


def _make_owner_mock() -> MagicMock:
    owner = MagicMock()
    owner.id = OWNER_ID
    owner.email = "owner@acme.test"
    owner.full_name = "Ada Owner"
    owner.org_name = "Acme Inc"
    owner.intended_use = None
    owner.is_active = True
    owner.approval_status = UserApprovalStatus.APPROVED
    owner.org_role = OrgRole.ORG_OWNER
    owner.created_at = datetime.now(UTC)
    owner.updated_at = datetime.now(UTC)
    return owner


def _make_license_mock() -> MagicMock:
    license = MagicMock()
    license.id = UUID("00000000-0000-0000-0000-000000000003")
    license.plan = LicensePlan.PRO
    license.status = "active"
    license.seat_limit = 5
    license.server_limit = None
    license.issued_at = datetime.now(UTC)
    license.expires_at = datetime.now(UTC)
    license.revoked_at = None
    license.licensee = "Acme Inc"
    license.created_at = datetime.now(UTC)
    license.updated_at = datetime.now(UTC)
    return license


def _make_issued_key(plaintext: str = "pk_abcdefgh_" + "a" * 43) -> IssuedKey:
    return IssuedKey(
        key_id=UUID("00000000-0000-0000-0000-000000000099"),
        plaintext=plaintext,
        prefix="abcdefgh",
        scopes=frozenset(),
    )


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    result = MagicMock()
    result.first = MagicMock(return_value=None)
    session.scalars = AsyncMock(return_value=result)
    return session


class TestProvisionTenant:
    @pytest.mark.asyncio
    async def test_returns_one_time_credentials(self) -> None:
        session = _make_session()
        issued = _make_issued_key()
        owner = _make_owner_mock()
        license = _make_license_mock()

        with (
            patch("app.provisioning.uuid4", return_value=TENANT_ID),
            patch(
                "app.provisioning.UserRepository",
                return_value=MagicMock(create=AsyncMock(return_value=owner)),
            ),
            patch(
                "app.provisioning.OrgMemberRepository",
                return_value=MagicMock(create=AsyncMock()),
            ),
            patch("app.provisioning.create_default_roles", new_callable=AsyncMock),
            patch("app.provisioning.bind_owner_to_org_owner", new_callable=AsyncMock),
            patch("app.provisioning.issue_key", new_callable=AsyncMock, return_value=issued),
            patch(
                "app.provisioning.LicenseService",
                return_value=MagicMock(
                    issue=AsyncMock(return_value=(license, "lc_plaintext"))
                ),
            ),
            patch(
                "app.provisioning.AuditRepository",
                return_value=MagicMock(create=AsyncMock()),
            ),
        ):
            result = await ProvisioningService().provision_tenant(
                session,
                _make_settings(),
                name="Acme Inc",
                slug="acme",
                owner_email="owner@acme.test",
                owner_full_name="Ada Owner",
                issuer_id=ISSUER_ID,
            )

        assert result.tenant is not None
        assert result.tenant.id == TENANT_ID
        assert result.tenant.slug == "acme"
        assert result.owner is owner
        assert result.access_token == issued.plaintext
        assert result.license_key == "lc_plaintext"
        assert result.owner_password  # server-generated
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_uses_provided_owner_password(self) -> None:
        session = _make_session()
        owner = _make_owner_mock()
        with (
            patch(
                "app.provisioning.UserRepository",
                return_value=MagicMock(create=AsyncMock(return_value=owner)),
            ),
            patch(
                "app.provisioning.OrgMemberRepository",
                return_value=MagicMock(create=AsyncMock()),
            ),
            patch("app.provisioning.create_default_roles", new_callable=AsyncMock),
            patch("app.provisioning.bind_owner_to_org_owner", new_callable=AsyncMock),
            patch(
                "app.provisioning.issue_key",
                new_callable=AsyncMock,
                return_value=_make_issued_key(),
            ),
            patch(
                "app.provisioning.LicenseService",
                return_value=MagicMock(
                    issue=AsyncMock(return_value=(_make_license_mock(), "lc_plaintext"))
                ),
            ),
            patch("app.provisioning.AuditRepository", return_value=MagicMock(create=AsyncMock())),
        ):
            result = await ProvisioningService().provision_tenant(
                session,
                _make_settings(),
                name="Acme Inc",
                slug="acme",
                owner_email="owner@acme.test",
                owner_full_name="Ada Owner",
                owner_password="super-secret-pw",
            )

        assert result.owner_password == "super-secret-pw"

    @pytest.mark.asyncio
    async def test_slug_collision_raises_provisioning_error(self) -> None:
        session = _make_session()
        session.scalars.return_value.first.return_value = TENANT_ID

        with pytest.raises(ProvisioningError, match="already in use"):
            await ProvisioningService().provision_tenant(
                session,
                _make_settings(),
                name="Acme Inc",
                slug="acme",
                owner_email="owner@acme.test",
                owner_full_name="Ada Owner",
            )

    @pytest.mark.asyncio
    async def test_creates_owner_with_org_owner_role_and_membership(self) -> None:
        """The owner is approved, org_owner, and has an org membership row."""
        session = _make_session()
        owner = _make_owner_mock()

        with (
            patch("app.provisioning.uuid4", return_value=TENANT_ID),
            patch(
                "app.provisioning.UserRepository",
                return_value=MagicMock(create=AsyncMock(return_value=owner)),
            ) as MockUsers,
            patch(
                "app.provisioning.OrgMemberRepository",
                return_value=MagicMock(create=AsyncMock()),
            ) as MockMembers,
            patch("app.provisioning.create_default_roles", new_callable=AsyncMock),
            patch("app.provisioning.bind_owner_to_org_owner", new_callable=AsyncMock),
            patch(
                "app.provisioning.issue_key",
                new_callable=AsyncMock,
                return_value=_make_issued_key(),
            ),
            patch(
                "app.provisioning.LicenseService",
                return_value=MagicMock(
                    issue=AsyncMock(return_value=(_make_license_mock(), "lc_plaintext"))
                ),
            ),
            patch("app.provisioning.AuditRepository", return_value=MagicMock(create=AsyncMock())),
        ):
            await ProvisioningService().provision_tenant(
                session,
                _make_settings(),
                name="Acme Inc",
                slug="acme",
                owner_email="owner@acme.test",
                owner_full_name="Ada Owner",
            )

        create_kwargs = MockUsers.return_value.create.call_args.kwargs
        assert create_kwargs["approval_status"] is UserApprovalStatus.APPROVED
        assert create_kwargs["org_role"] is OrgRole.ORG_OWNER

        member_create = MockMembers.return_value.create.call_args
        assert member_create.args[0] == TENANT_ID
        assert member_create.args[1].admin_role.value == "org_owner"

    @pytest.mark.asyncio
    async def test_writes_provisioned_audit_event(self) -> None:
        session = _make_session()
        owner = _make_owner_mock()

        with (
            patch("app.provisioning.uuid4", return_value=TENANT_ID),
            patch(
                "app.provisioning.UserRepository",
                return_value=MagicMock(create=AsyncMock(return_value=owner)),
            ),
            patch(
                "app.provisioning.OrgMemberRepository",
                return_value=MagicMock(create=AsyncMock()),
            ),
            patch("app.provisioning.create_default_roles", new_callable=AsyncMock),
            patch("app.provisioning.bind_owner_to_org_owner", new_callable=AsyncMock),
            patch(
                "app.provisioning.issue_key",
                new_callable=AsyncMock,
                return_value=_make_issued_key(),
            ),
            patch(
                "app.provisioning.LicenseService",
                return_value=MagicMock(
                    issue=AsyncMock(return_value=(_make_license_mock(), "lc_plaintext"))
                ),
            ),
            patch("app.provisioning.AuditRepository", return_value=MagicMock(create=AsyncMock())) as MockAudit,
        ):
            await ProvisioningService().provision_tenant(
                session,
                _make_settings(),
                name="Acme Inc",
                slug="acme",
                owner_email="owner@acme.test",
                owner_full_name="Ada Owner",
                issuer_id=ISSUER_ID,
            )

        audit_call = MockAudit.return_value.create.call_args
        assert audit_call.kwargs["event_type"].value == "tenant_provisioned"
        assert audit_call.kwargs["tenant_id"] == TENANT_ID
        assert audit_call.kwargs["subject_id"] == str(ISSUER_ID)
        assert audit_call.kwargs["detail"]["tenant_slug"] == "acme"