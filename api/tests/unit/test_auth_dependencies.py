"""Unit tests for app.auth.dependencies."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.auth.dependencies import admin_subject, authenticated_subject, current_subject
from app.auth.subject import Subject
from app.models.orm import SubjectType

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
PEPPER = "development-only-change-me"


def _make_subject(scopes: list[str] | None = None) -> Subject:
    return Subject(
        subject_id=str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=TENANT_ID,
        scopes=frozenset(scopes or []),
    )


def _make_mock_session() -> AsyncMock:
    return AsyncMock()


def _make_mock_settings(pepper: str = PEPPER) -> AsyncMock:
    settings = AsyncMock()
    settings.api_key_pepper = pepper
    return settings


# ---------------------------------------------------------------------------
# current_subject — Bearer parsing and key verification
# ---------------------------------------------------------------------------


class TestCurrentSubject:
    @pytest.mark.asyncio
    async def test_missing_header_raises_401(self) -> None:
        session = _make_mock_session()
        settings = _make_mock_settings()

        with pytest.raises(HTTPException) as exc_info:
            await current_subject(authorization="", session=session, settings=settings)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid or missing credentials"

    @pytest.mark.asyncio
    async def test_bearer_only_raises_401(self) -> None:
        """'Bearer ' with nothing after it should raise 401."""
        session = _make_mock_session()
        settings = _make_mock_settings()

        with pytest.raises(HTTPException) as exc_info:
            await current_subject(authorization="Bearer ", session=session, settings=settings)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_key_raises_401(self) -> None:
        session = _make_mock_session()
        settings = _make_mock_settings()

        with patch("app.auth.authenticate.verify_key", new_callable=AsyncMock) as mock_verify:
            mock_verify.side_effect = ValueError("invalid API key")

            with pytest.raises(HTTPException) as exc_info:
                await current_subject(
                    authorization="Bearer pk_badprefix_" + "a" * 43,
                    session=session,
                    settings=settings,
                )

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid or missing credentials"

    @pytest.mark.asyncio
    async def test_valid_key_returns_subject(self) -> None:
        session = _make_mock_session()
        settings = _make_mock_settings()
        expected = _make_subject(["admin"])

        with patch("app.auth.authenticate.verify_key", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = expected

            result = await current_subject(
                authorization="Bearer pk_abcdefgh_" + "a" * 43,
                session=session,
                settings=settings,
            )

        assert result is expected
        mock_verify.assert_awaited_once_with(
            raw="pk_abcdefgh_" + "a" * 43,
            pepper=PEPPER,
            session=session,
        )  # API key path dispatches to verify_key

    @pytest.mark.asyncio
    async def test_non_bearer_scheme_raises_401(self) -> None:
        """Non-Bearer authorization value should fail — raw remains after strip."""
        session = _make_mock_session()
        settings = _make_mock_settings()

        with patch("app.auth.authenticate.verify_key", new_callable=AsyncMock) as mock_verify:
            mock_verify.side_effect = ValueError("invalid API key")

            with pytest.raises(HTTPException) as exc_info:
                await current_subject(
                    authorization="Token some-value",
                    session=session,
                    settings=settings,
                )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_401_does_not_reveal_prefix_existence(self) -> None:
        """Error message must never say 'prefix not found' — always same detail."""
        session = _make_mock_session()
        settings = _make_mock_settings()

        with patch("app.auth.authenticate.verify_key", new_callable=AsyncMock) as mock_verify:
            mock_verify.side_effect = ValueError("invalid API key")

            with pytest.raises(HTTPException) as exc_info:
                await current_subject(
                    authorization="Bearer pk_xxxxxxxx_" + "x" * 43,
                    session=session,
                    settings=settings,
                )

        assert exc_info.value.detail == "Invalid or missing credentials"


# ---------------------------------------------------------------------------
# authenticated_subject
# ---------------------------------------------------------------------------


class TestAuthenticatedSubject:
    @pytest.mark.asyncio
    async def test_passes_through_any_valid_subject(self) -> None:
        subject = _make_subject(["read"])
        result = await authenticated_subject(subject=subject)
        assert result is subject

    @pytest.mark.asyncio
    async def test_passes_through_admin_subject(self) -> None:
        subject = _make_subject(["admin"])
        result = await authenticated_subject(subject=subject)
        assert result is subject


# ---------------------------------------------------------------------------
# admin_subject
# ---------------------------------------------------------------------------


class TestAdminSubject:
    @pytest.mark.asyncio
    async def test_admin_scope_passes(self) -> None:
        subject = _make_subject(["admin"])
        result = await admin_subject(subject=subject)
        assert result is subject

    @pytest.mark.asyncio
    async def test_missing_admin_scope_raises_403(self) -> None:
        subject = _make_subject(["read"])

        with pytest.raises(HTTPException) as exc_info:
            await admin_subject(subject=subject)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Admin scope required"

    @pytest.mark.asyncio
    async def test_empty_scopes_raises_403(self) -> None:
        subject = _make_subject([])

        with pytest.raises(HTTPException) as exc_info:
            await admin_subject(subject=subject)

        assert exc_info.value.status_code == 403
