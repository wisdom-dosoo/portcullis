"""Unit tests for app.cli — admin-key create command."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from app.auth.subject import IssuedKey
from app.cli import _create_admin_key

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
