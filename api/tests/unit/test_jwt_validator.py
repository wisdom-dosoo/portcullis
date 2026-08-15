"""JWT and JWKS validation test boundary."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from authlib.jose import JsonWebKey
from authlib.jose import jwt as jose_jwt
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa

import app.auth.jwt_validator as jwt_validator_module
from app.auth.jwt_validator import DEFAULT_TENANT_ID, verify_jwt
from app.auth.subject import Subject
from app.config import Settings
from app.models.orm import SubjectType

# ---------------------------------------------------------------------------
# RSA key fixtures shared across all test cases
# ---------------------------------------------------------------------------

# Generate a real RSA key pair once at module load — used for signing test JWTs.
_PRIVATE_KEY_OBJ = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
    backend=default_backend(),
)
_JWK_PRIVATE = JsonWebKey.import_key(_PRIVATE_KEY_OBJ, {"kty": "RSA", "kid": "test-key-1"})
_JWK_PUBLIC = JsonWebKey.import_key(
    _PRIVATE_KEY_OBJ.public_key(), {"kty": "RSA", "kid": "test-key-1"}
)
_JWKS_DICT: dict = {"keys": [_JWK_PUBLIC.as_dict()]}


def _make_settings(
    *,
    jwks_url: str | None = "https://example.com/.well-known/jwks.json",
    issuer: str | None = "https://example.com/",
    audience: str = "portcullis",
    cache_ttl: int = 300,
) -> MagicMock:
    """Build a mock Settings object pre-configured for JWT tests."""
    settings = MagicMock(spec=Settings)
    settings.jwt_jwks_url = jwks_url
    settings.jwt_issuer = issuer
    settings.jwt_audience = audience
    settings.jwt_jwks_cache_ttl_seconds = cache_ttl
    return settings


def _make_token(
    *,
    sub: str | None = "user-abc-123",
    aud: str | list[str] = "portcullis",
    iss: str = "https://example.com/",
    exp_offset: int = 3600,
    scope: str = "read write",
    include_sub: bool = True,
) -> str:
    """Sign and return a real RS256 JWT using the module-level test key."""
    now = int(time.time())
    payload: dict = {
        "iss": iss,
        "aud": aud,
        "iat": now,
        "exp": now + exp_offset,
    }
    if include_sub and sub is not None:
        payload["sub"] = sub
    if scope:
        payload["scope"] = scope

    header = {"alg": "RS256", "kid": "test-key-1"}
    token_bytes = jose_jwt.encode(header, payload, _JWK_PRIVATE)
    # authlib returns bytes; decode to str for the API
    return token_bytes.decode() if isinstance(token_bytes, bytes) else token_bytes


def _make_mock_httpx_client(jwks_dict: dict) -> MagicMock:
    """Return a mock that satisfies ``async with httpx.AsyncClient() as client:`` usage."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock(return_value=None)
    mock_response.json = MagicMock(return_value=jwks_dict)

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    mock_cls = MagicMock(return_value=mock_client)
    return mock_cls


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_jwks_cache() -> None:
    """Clear the module-level JWKS cache before every test to prevent interference."""
    jwt_validator_module._reset_cache()


# ---------------------------------------------------------------------------
# verify_jwt — happy path
# ---------------------------------------------------------------------------


class TestVerifyJwtValid:
    @pytest.mark.asyncio
    async def test_valid_jwt_returns_correct_subject(self) -> None:
        """A correctly signed JWT with matching aud/iss returns a Subject."""
        token = _make_token(sub="user-abc-123", scope="read write")
        settings = _make_settings()

        with patch(
            "app.auth.jwt_validator.httpx.AsyncClient",
            _make_mock_httpx_client(_JWKS_DICT),
        ):
            subject = await verify_jwt(raw_token=token, settings=settings)

        assert isinstance(subject, Subject)
        assert subject.subject_id == "user-abc-123"
        assert subject.subject_type == SubjectType.OAUTH_SUBJECT
        assert subject.tenant_id == DEFAULT_TENANT_ID
        assert subject.scopes == frozenset({"read", "write"})

    @pytest.mark.asyncio
    async def test_valid_jwt_with_empty_scope_returns_empty_frozenset(self) -> None:
        """A JWT with no scope claim yields an empty frozenset of scopes."""
        token = _make_token(sub="user-no-scope", scope="")
        settings = _make_settings()

        with patch(
            "app.auth.jwt_validator.httpx.AsyncClient",
            _make_mock_httpx_client(_JWKS_DICT),
        ):
            subject = await verify_jwt(raw_token=token, settings=settings)

        assert subject.scopes == frozenset()

    @pytest.mark.asyncio
    async def test_valid_jwt_with_single_scope(self) -> None:
        token = _make_token(sub="user-x", scope="admin")
        settings = _make_settings()

        with patch(
            "app.auth.jwt_validator.httpx.AsyncClient",
            _make_mock_httpx_client(_JWKS_DICT),
        ):
            subject = await verify_jwt(raw_token=token, settings=settings)

        assert subject.scopes == frozenset({"admin"})


# ---------------------------------------------------------------------------
# verify_jwt — failure cases
# ---------------------------------------------------------------------------


class TestVerifyJwtFailures:
    @pytest.mark.asyncio
    async def test_expired_jwt_raises_value_error(self) -> None:
        """A JWT whose exp is in the past must be rejected."""
        # exp_offset=-3600 ensures it's well past expiry regardless of authlib leeway
        token = _make_token(sub="user-abc-123", exp_offset=-3600)
        settings = _make_settings()

        with (
            patch(
                "app.auth.jwt_validator.httpx.AsyncClient",
                _make_mock_httpx_client(_JWKS_DICT),
            ),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token=token, settings=settings)

    @pytest.mark.asyncio
    async def test_wrong_audience_raises_value_error(self) -> None:
        """A JWT with a mismatched aud claim must be rejected."""
        token = _make_token(sub="user-abc-123", aud="wrong-audience")
        settings = _make_settings(audience="portcullis")

        with (
            patch(
                "app.auth.jwt_validator.httpx.AsyncClient",
                _make_mock_httpx_client(_JWKS_DICT),
            ),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token=token, settings=settings)

    @pytest.mark.asyncio
    async def test_wrong_issuer_raises_value_error(self) -> None:
        """A JWT with a mismatched iss claim must be rejected."""
        token = _make_token(sub="user-abc-123", iss="https://evil.example.com/")
        settings = _make_settings(issuer="https://example.com/")

        with (
            patch(
                "app.auth.jwt_validator.httpx.AsyncClient",
                _make_mock_httpx_client(_JWKS_DICT),
            ),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token=token, settings=settings)

    @pytest.mark.asyncio
    async def test_missing_sub_claim_raises_value_error(self) -> None:
        """A JWT without a sub claim must be rejected."""
        token = _make_token(include_sub=False)
        settings = _make_settings()

        with (
            patch(
                "app.auth.jwt_validator.httpx.AsyncClient",
                _make_mock_httpx_client(_JWKS_DICT),
            ),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token=token, settings=settings)

    @pytest.mark.asyncio
    async def test_jwks_fetch_failure_raises_value_error(self) -> None:
        """An httpx error during JWKS fetch must raise ValueError."""
        import httpx as _httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=_httpx.RequestError("network failure"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_cls = MagicMock(return_value=mock_client)

        token = _make_token(sub="user-abc-123")
        settings = _make_settings()

        with (
            patch("app.auth.jwt_validator.httpx.AsyncClient", mock_cls),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token=token, settings=settings)

    @pytest.mark.asyncio
    async def test_jwt_auth_not_configured_raises_value_error(self) -> None:
        """When jwks_url is None, verify_jwt must raise ValueError immediately."""
        token = _make_token(sub="user-abc-123")
        settings = _make_settings(jwks_url=None)

        with pytest.raises(ValueError, match="JWT auth is not configured"):
            await verify_jwt(raw_token=token, settings=settings)

    @pytest.mark.asyncio
    async def test_malformed_token_raises_value_error(self) -> None:
        """A non-JWT string (not a valid compact serialization) must be rejected."""
        settings = _make_settings()

        with (
            patch(
                "app.auth.jwt_validator.httpx.AsyncClient",
                _make_mock_httpx_client(_JWKS_DICT),
            ),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token="this.is.not.a.jwt", settings=settings)

    @pytest.mark.asyncio
    async def test_wrong_signing_key_raises_value_error(self) -> None:
        """A JWT signed with a different key must be rejected."""
        # Generate a different key
        other_private = rsa.generate_private_key(
            public_exponent=65537, key_size=2048, backend=default_backend()
        )
        other_jwk_private = JsonWebKey.import_key(other_private, {"kty": "RSA", "kid": "other-key"})

        # Sign with the other key but present the original JWKS (which doesn't include it)
        now = int(time.time())
        payload = {
            "sub": "user-abc-123",
            "iss": "https://example.com/",
            "aud": "portcullis",
            "iat": now,
            "exp": now + 3600,
        }
        header = {"alg": "RS256", "kid": "other-key"}
        token_bytes = jose_jwt.encode(header, payload, other_jwk_private)
        token = token_bytes.decode() if isinstance(token_bytes, bytes) else token_bytes

        settings = _make_settings()

        with (
            patch(
                "app.auth.jwt_validator.httpx.AsyncClient",
                _make_mock_httpx_client(_JWKS_DICT),
            ),
            pytest.raises(ValueError, match="invalid bearer token"),
        ):
            await verify_jwt(raw_token=token, settings=settings)


# ---------------------------------------------------------------------------
# verify_jwt — caching behaviour
# ---------------------------------------------------------------------------


class TestVerifyJwtCaching:
    @pytest.mark.asyncio
    async def test_second_call_uses_cache_jwks_fetched_once(self) -> None:
        """The JWKS endpoint must be called only once across two verify_jwt calls."""
        token1 = _make_token(sub="user-1")
        token2 = _make_token(sub="user-2")
        settings = _make_settings()

        mock_cls = _make_mock_httpx_client(_JWKS_DICT)

        with patch("app.auth.jwt_validator.httpx.AsyncClient", mock_cls):
            await verify_jwt(raw_token=token1, settings=settings)
            await verify_jwt(raw_token=token2, settings=settings)

        # AsyncClient was instantiated twice (once per verify_jwt call),
        # but ``get`` should have been called only once — second call hits the cache.
        mock_instance = mock_cls.return_value
        mock_instance.get.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cache_expires_after_ttl(self) -> None:
        """After the cache TTL elapses, the JWKS endpoint must be re-fetched."""
        token = _make_token(sub="user-x")
        # TTL of 0 seconds — every call should re-fetch.
        settings = _make_settings(cache_ttl=0)

        mock_cls = _make_mock_httpx_client(_JWKS_DICT)

        with patch("app.auth.jwt_validator.httpx.AsyncClient", mock_cls):
            await verify_jwt(raw_token=token, settings=settings)
            # Invalidate cache by setting fetched_at to a time before TTL
            jwt_validator_module._jwks_cache["fetched_at"] = 0.0
            await verify_jwt(raw_token=token, settings=settings)

        # get() must have been called twice since TTL was exceeded
        mock_instance = mock_cls.return_value
        assert mock_instance.get.await_count == 2


# ---------------------------------------------------------------------------
# verify_jwt — issuer/audience disabled when settings field is falsy
# ---------------------------------------------------------------------------


class TestVerifyJwtOptionalClaims:
    @pytest.mark.asyncio
    async def test_no_issuer_check_when_issuer_is_none(self) -> None:
        """When jwt_issuer is None, any iss claim should be accepted."""
        # Token with a different issuer — should still pass if issuer check disabled
        token = _make_token(sub="user-abc-123", iss="https://any-issuer.example.com/")
        settings = _make_settings(issuer=None)

        with patch(
            "app.auth.jwt_validator.httpx.AsyncClient",
            _make_mock_httpx_client(_JWKS_DICT),
        ):
            subject = await verify_jwt(raw_token=token, settings=settings)

        assert subject.subject_id == "user-abc-123"

    @pytest.mark.asyncio
    async def test_no_audience_check_when_audience_is_empty(self) -> None:
        """When jwt_audience is an empty string, aud validation should be skipped."""
        token = _make_token(sub="user-abc-123", aud="some-other-audience")
        settings = _make_settings(audience="")

        with patch(
            "app.auth.jwt_validator.httpx.AsyncClient",
            _make_mock_httpx_client(_JWKS_DICT),
        ):
            subject = await verify_jwt(raw_token=token, settings=settings)

        assert subject.subject_id == "user-abc-123"
