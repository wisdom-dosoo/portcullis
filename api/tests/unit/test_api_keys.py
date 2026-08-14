"""API key lifecycle unit tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from argon2 import PasswordHasher

from app.auth.api_keys import issue_key, parse_key, revoke_key, verify_key
from app.auth.subject import IssuedKey, Subject
from app.models.orm import ApiKey, SubjectType

# Low-cost PasswordHasher for unit tests — avoids slow Argon2 tuning.
_FAST_PH = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
PEPPER = "test-pepper-for-unit-tests"


def _make_mock_session() -> AsyncMock:
    """Return an AsyncMock that satisfies AsyncSession usage patterns."""
    session = AsyncMock()
    session.commit = AsyncMock(return_value=None)
    return session


def _make_api_key_orm(
    *,
    key_id: UUID | None = None,
    prefix: str = "testpref",
    secret: str,
    scopes: list[str] | None = None,
    revoked: bool = False,
) -> MagicMock:
    """Build a mock ApiKey ORM object with a real Argon2 hash."""
    obj = MagicMock(spec=ApiKey)
    obj.id = key_id or uuid4()
    obj.tenant_id = TENANT_ID
    obj.key_prefix = prefix
    obj.key_hash = _FAST_PH.hash(secret + PEPPER)
    obj.scopes = scopes or []
    obj.revoked_at = "2024-01-01" if revoked else None
    return obj


# ---------------------------------------------------------------------------
# parse_key
# ---------------------------------------------------------------------------


class TestParseKey:
    def test_valid_key_returns_prefix_and_secret(self) -> None:
        prefix = "abcdefgh"
        secret = "a" * 43
        raw = f"pk_{prefix}_{secret}"
        result_prefix, result_secret = parse_key(raw)
        assert result_prefix == prefix
        assert result_secret == secret

    def test_missing_pk_marker_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid API key format"):
            parse_key("xx_abcdefgh_" + "a" * 43)

    def test_too_few_segments_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid API key format"):
            parse_key("pk_abcdefgh")

    def test_too_many_segments_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid API key format"):
            parse_key("pk_abcdefgh_" + "a" * 43 + "_extra")

    def test_wrong_prefix_length_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid API key format"):
            parse_key("pk_short_" + "a" * 43)

    def test_wrong_secret_length_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid API key format"):
            parse_key("pk_abcdefgh_" + "a" * 10)

    def test_empty_string_raises(self) -> None:
        with pytest.raises(ValueError, match="invalid API key format"):
            parse_key("")


# ---------------------------------------------------------------------------
# issue_key
# ---------------------------------------------------------------------------


class TestIssueKey:
    @pytest.mark.asyncio
    async def test_issued_key_starts_with_pk(self) -> None:
        session = _make_mock_session()
        fake_orm = _make_api_key_orm(secret="x" * 43)

        with patch(
            "app.auth.api_keys.ApiKeyRepository.create",
            new_callable=AsyncMock,
            return_value=fake_orm,
        ):
            result = await issue_key(
                name="test",
                scopes=["admin"],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )

        assert result.plaintext.startswith("pk_")

    @pytest.mark.asyncio
    async def test_issued_key_has_correct_segment_structure(self) -> None:
        session = _make_mock_session()
        fake_orm = _make_api_key_orm(secret="x" * 43)

        with patch(
            "app.auth.api_keys.ApiKeyRepository.create",
            new_callable=AsyncMock,
            return_value=fake_orm,
        ):
            result = await issue_key(
                name="test",
                scopes=[],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )

        # Use parse_key to correctly extract prefix/secret (handles embedded underscores).
        assert result.plaintext.startswith("pk_")
        prefix, secret = parse_key(result.plaintext)
        assert len(prefix) == 8  # prefix
        assert len(secret) == 43  # secret

    @pytest.mark.asyncio
    async def test_two_issued_keys_have_different_prefixes_and_secrets(self) -> None:
        session = _make_mock_session()
        fake_orm1 = _make_api_key_orm(key_id=uuid4(), secret="x" * 43)
        fake_orm2 = _make_api_key_orm(key_id=uuid4(), secret="y" * 43)

        with patch(
            "app.auth.api_keys.ApiKeyRepository.create",
            new_callable=AsyncMock,
            side_effect=[fake_orm1, fake_orm2],
        ):
            key1 = await issue_key(
                name="k1",
                scopes=[],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )
            key2 = await issue_key(
                name="k2",
                scopes=[],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )

        # Use parse_key to correctly extract prefix/secret (handles embedded underscores).
        p1, s1 = parse_key(key1.plaintext)
        p2, s2 = parse_key(key2.plaintext)
        assert p1 != p2
        assert s1 != s2

    @pytest.mark.asyncio
    async def test_issue_key_commits_session(self) -> None:
        session = _make_mock_session()
        fake_orm = _make_api_key_orm(secret="x" * 43)

        with patch(
            "app.auth.api_keys.ApiKeyRepository.create",
            new_callable=AsyncMock,
            return_value=fake_orm,
        ):
            await issue_key(
                name="test",
                scopes=[],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )

        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_issue_key_returns_issued_key_type(self) -> None:
        session = _make_mock_session()
        fake_orm = _make_api_key_orm(secret="x" * 43)

        with patch(
            "app.auth.api_keys.ApiKeyRepository.create",
            new_callable=AsyncMock,
            return_value=fake_orm,
        ):
            result = await issue_key(
                name="test",
                scopes=["admin"],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )

        assert isinstance(result, IssuedKey)
        assert result.scopes == frozenset(["admin"])

    @pytest.mark.asyncio
    async def test_issue_key_plaintext_not_stored(self) -> None:
        """The hash stored in the DB must not equal the plaintext (one-time secret).

        We verify this indirectly: the returned plaintext follows the ``pk_`` key
        format while an Argon2id hash always starts with ``$argon2id$``.
        """
        session = _make_mock_session()
        fake_orm = _make_api_key_orm(secret="x" * 43)

        # Capture the key_hash argument passed to repo.create.
        captured: dict[str, str] = {}

        async def spy_create(
            tenant_id: UUID,
            name: str,
            key_prefix: str,
            key_hash: str,
            scopes: list[str],
            user_id: UUID | None = None,
        ) -> MagicMock:
            captured["key_hash"] = key_hash
            return fake_orm

        with patch(
            "app.auth.api_keys.ApiKeyRepository.create",
            new_callable=AsyncMock,
            side_effect=spy_create,
        ):
            result = await issue_key(
                name="test",
                scopes=[],
                pepper=PEPPER,
                session=session,
                tenant_id=TENANT_ID,
                ph=_FAST_PH,
            )

        # The stored value is an Argon2id hash, not the plaintext key.
        assert captured["key_hash"].startswith("$argon2id$")
        assert result.plaintext.startswith("pk_")
        assert result.plaintext != captured["key_hash"]


# ---------------------------------------------------------------------------
# verify_key
# ---------------------------------------------------------------------------


class TestVerifyKey:
    @pytest.mark.asyncio
    async def test_correct_key_returns_subject(self) -> None:
        secret = "a" * 43
        prefix = "testpref"
        raw = f"pk_{prefix}_{secret}"
        fake_orm = _make_api_key_orm(prefix=prefix, secret=secret)

        session = _make_mock_session()

        with patch(
            "app.auth.api_keys.ApiKeyRepository.get_by_prefix",
            new_callable=AsyncMock,
            return_value=fake_orm,
        ):
            result = await verify_key(raw=raw, pepper=PEPPER, session=session, ph=_FAST_PH)

        assert isinstance(result, Subject)
        assert result.subject_id == str(fake_orm.id)
        assert result.subject_type == SubjectType.API_KEY
        assert result.tenant_id == TENANT_ID

    @pytest.mark.asyncio
    async def test_wrong_secret_raises_uniform_error(self) -> None:
        secret = "a" * 43
        prefix = "testpref"
        wrong_raw = f"pk_{prefix}_{'b' * 43}"
        fake_orm = _make_api_key_orm(prefix=prefix, secret=secret)

        session = _make_mock_session()

        with (
            patch(
                "app.auth.api_keys.ApiKeyRepository.get_by_prefix",
                new_callable=AsyncMock,
                return_value=fake_orm,
            ),
            pytest.raises(ValueError, match="invalid API key"),
        ):
            await verify_key(raw=wrong_raw, pepper=PEPPER, session=session, ph=_FAST_PH)

    @pytest.mark.asyncio
    async def test_unknown_prefix_raises_uniform_error(self) -> None:
        raw = "pk_" + "z" * 8 + "_" + "z" * 43
        session = _make_mock_session()

        with (
            patch(
                "app.auth.api_keys.ApiKeyRepository.get_by_prefix",
                new_callable=AsyncMock,
                return_value=None,
            ),
            pytest.raises(ValueError, match="invalid API key"),
        ):
            await verify_key(raw=raw, pepper=PEPPER, session=session, ph=_FAST_PH)

    @pytest.mark.asyncio
    async def test_malformed_key_raises_uniform_error(self) -> None:
        session = _make_mock_session()

        with pytest.raises(ValueError, match="invalid API key"):
            await verify_key(raw="not-a-valid-key", pepper=PEPPER, session=session, ph=_FAST_PH)

    @pytest.mark.asyncio
    async def test_verify_key_returns_correct_scopes(self) -> None:
        secret = "a" * 43
        prefix = "testpref"
        raw = f"pk_{prefix}_{secret}"
        fake_orm = _make_api_key_orm(prefix=prefix, secret=secret, scopes=["admin", "read"])

        session = _make_mock_session()

        with patch(
            "app.auth.api_keys.ApiKeyRepository.get_by_prefix",
            new_callable=AsyncMock,
            return_value=fake_orm,
        ):
            result = await verify_key(raw=raw, pepper=PEPPER, session=session, ph=_FAST_PH)

        assert result.scopes == frozenset(["admin", "read"])


# ---------------------------------------------------------------------------
# Subject.has_scope
# ---------------------------------------------------------------------------


class TestSubjectHasScope:
    def test_has_scope_true_for_held_scope(self) -> None:
        subject = Subject(
            subject_id=str(uuid4()),
            subject_type=SubjectType.API_KEY,
            tenant_id=TENANT_ID,
            scopes=frozenset(["admin"]),
        )
        assert subject.has_scope("admin") is True

    def test_has_scope_false_for_missing_scope(self) -> None:
        subject = Subject(
            subject_id=str(uuid4()),
            subject_type=SubjectType.API_KEY,
            tenant_id=TENANT_ID,
            scopes=frozenset(["read"]),
        )
        assert subject.has_scope("admin") is False

    def test_has_scope_false_for_empty_scopes(self) -> None:
        subject = Subject(
            subject_id=str(uuid4()),
            subject_type=SubjectType.API_KEY,
            tenant_id=TENANT_ID,
            scopes=frozenset(),
        )
        assert subject.has_scope("admin") is False


# ---------------------------------------------------------------------------
# revoke_key
# ---------------------------------------------------------------------------


class TestRevokeKey:
    @pytest.mark.asyncio
    async def test_revoke_key_commits_on_success(self) -> None:
        key_id = uuid4()
        session = _make_mock_session()

        with patch(
            "app.auth.api_keys.ApiKeyRepository.revoke",
            new_callable=AsyncMock,
            return_value=True,
        ):
            await revoke_key(key_id=key_id, tenant_id=TENANT_ID, session=session)

        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_revoke_key_raises_key_error_when_not_found(self) -> None:
        key_id = uuid4()
        session = _make_mock_session()

        with (
            patch(
                "app.auth.api_keys.ApiKeyRepository.revoke",
                new_callable=AsyncMock,
                return_value=False,
            ),
            pytest.raises(KeyError),
        ):
            await revoke_key(key_id=key_id, tenant_id=TENANT_ID, session=session)
