"""Unit tests for app.cli — admin-key create command."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from app.auth.subject import IssuedKey
from app.cli import _bootstrap_admin, _create_admin_key, _provision_tenant
from app.provisioning import ProvisioningError

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


def _make_issued_key(plaintext: str = "pk_abcdefgh_" + "a" * 43) -> IssuedKey:
    return IssuedKey(
        key_id=UUID("00000000-0000-0000-0000-000000000099"),
        plaintext=plaintext,
        prefix="abcdefgh",
        scopes=frozenset(["admin"]),
    )


def _make_mock_runtime() -> MagicMock:
    runtime = MagicMock()
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    runtime.session_factory = MagicMock(return_value=mock_session_ctx)
    runtime.close = AsyncMock(return_value=None)
    return runtime


class TestCreateAdminKey:
    @pytest.mark.asyncio
    async def test_prints_plaintext_to_stdout(self, capsys: pytest.CaptureFixture[str]) -> None:
        plaintext = "pk_abcdefgh_" + "a" * 43
        issued = _make_issued_key(plaintext)
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.issue_key", new_callable=AsyncMock, return_value=issued),
        ):
            await _create_admin_key("my-admin-key")

        captured = capsys.readouterr()
        assert captured.out.strip() == plaintext

    @pytest.mark.asyncio
    async def test_closes_runtime_on_success(self) -> None:
        issued = _make_issued_key()
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.issue_key", new_callable=AsyncMock, return_value=issued),
        ):
            await _create_admin_key("my-admin-key")

        mock_runtime.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_closes_runtime_on_failure(self) -> None:
        """Runtime.close must be called even if issue_key raises."""
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch(
                "app.cli.issue_key",
                new_callable=AsyncMock,
                side_effect=RuntimeError("db error"),
            ),
            pytest.raises(RuntimeError, match="db error"),
        ):
            await _create_admin_key("my-admin-key")

        mock_runtime.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_issues_key_with_admin_scope(self) -> None:
        issued = _make_issued_key()
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.issue_key", new_callable=AsyncMock, return_value=issued) as mock_issue,
        ):
            await _create_admin_key("my-admin-key")

        call_kwargs = mock_issue.call_args
        assert call_kwargs.kwargs["scopes"] == ["admin"] or (
            len(call_kwargs.args) > 1 and call_kwargs.args[1] == ["admin"]
        )
        # name should match
        assert call_kwargs.kwargs.get("name") == "my-admin-key" or (
            len(call_kwargs.args) > 0 and call_kwargs.args[0] == "my-admin-key"
        )


# ---------------------------------------------------------------------------
# admin bootstrap
# ---------------------------------------------------------------------------


def _make_user_mock() -> MagicMock:
    user = MagicMock()
    user.id = UUID("00000000-0000-0000-0000-0000000000ab")
    user.email = "owner@example.com"
    return user


class TestBootstrapAdmin:
    @pytest.mark.asyncio
    async def test_promotes_user_and_prints_token(self, capsys) -> None:
        plaintext = "pk_abcdefgh_" + "a" * 43
        issued = IssuedKey(
            key_id=UUID("00000000-0000-0000-0000-000000000099"),
            plaintext=plaintext,
            prefix="abcdefgh",
            scopes=frozenset(),
        )
        mock_runtime = _make_mock_runtime()
        mock_user = _make_user_mock()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.UserRepository") as MockUsers,
            patch("app.cli.AuditRepository") as MockAudit,
            patch("app.cli.issue_key", new_callable=AsyncMock, return_value=issued) as mock_issue,
        ):
            repo = MockUsers.return_value
            repo.get_by_email = AsyncMock(return_value=mock_user)
            repo.set_platform_admin = AsyncMock(return_value=True)
            audit = MockAudit.return_value
            audit.create = AsyncMock(return_value=MagicMock())

            await _bootstrap_admin("owner@example.com")

        assert MockUsers.return_value.set_platform_admin.await_count == 1
        audit.create.assert_awaited_once()
        mock_issue.assert_awaited_once()
        captured = capsys.readouterr()
        assert captured.out.strip() == plaintext

    @pytest.mark.asyncio
    async def test_missing_user_raises_system_exit(self, capsys) -> None:
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch("app.cli.UserRepository") as MockUsers,
        ):
            MockUsers.return_value.get_by_email = AsyncMock(return_value=None)

            with pytest.raises(SystemExit):
                await _bootstrap_admin("missing@example.com")

        mock_runtime.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# provision-tenant
# ---------------------------------------------------------------------------


def _make_provision_args(**overrides) -> MagicMock:
    args = MagicMock()
    args.name = "Acme Inc"
    args.slug = "acme"
    args.owner_email = "owner@acme.test"
    args.owner_full_name = "Ada Owner"
    args.owner_password = None
    args.plan = "pro"
    args.licensee = None
    args.seat_limit = 5
    args.server_limit = None
    args.expires_in_days = 365
    for key, value in overrides.items():
        setattr(args, key, value)
    return args


def _make_provision_result_mock() -> MagicMock:
    result = MagicMock()
    result.tenant = MagicMock()
    result.tenant.name = "Acme Inc"
    result.tenant.slug = "acme"
    result.tenant.id = UUID("00000000-0000-0000-0000-0000000000aa")
    result.owner = MagicMock()
    result.owner.email = "owner@acme.test"
    result.access_token = "pk_abcdefgh_" + "a" * 43
    result.license_key = "lc_plaintext"
    result.license = MagicMock()
    result.license.plan = MagicMock(value="pro")
    result.owner_password = "generated-password"
    return result


class TestProvisionTenant:
    @pytest.mark.asyncio
    async def test_prints_credentials_to_stdout(self, capsys) -> None:
        mock_runtime = _make_mock_runtime()
        result = _make_provision_result_mock()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch(
                "app.cli.ProvisioningService",
                return_value=MagicMock(provision_tenant=AsyncMock(return_value=result)),
            ),
        ):
            await _provision_tenant(_make_provision_args())

        captured = capsys.readouterr()
        assert "Tenant provisioned: Acme Inc (acme)" in captured.out
        assert result.access_token in captured.out
        assert "owner_password: generated-password" in captured.out
        mock_runtime.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_does_not_print_password_when_client_provided(self, capsys) -> None:
        mock_runtime = _make_mock_runtime()
        result = _make_provision_result_mock()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch(
                "app.cli.ProvisioningService",
                return_value=MagicMock(provision_tenant=AsyncMock(return_value=result)),
            ),
        ):
            await _provision_tenant(_make_provision_args(owner_password="client-pw"))

        captured = capsys.readouterr()
        assert "owner_password" not in captured.out
        mock_runtime.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_slug_conflict_raises_system_exit(self) -> None:
        mock_runtime = _make_mock_runtime()

        with (
            patch("app.cli.Runtime.build", return_value=mock_runtime),
            patch("app.cli.get_settings", return_value=MagicMock(api_key_pepper="test-pepper")),
            patch(
                "app.cli.ProvisioningService",
                return_value=MagicMock(
                    provision_tenant=AsyncMock(
                        side_effect=ProvisioningError("tenant slug already in use: acme")
                    )
                ),
            ),
            pytest.raises(SystemExit, match="already in use"),
        ):
            await _provision_tenant(_make_provision_args())

        mock_runtime.close.assert_awaited_once()
