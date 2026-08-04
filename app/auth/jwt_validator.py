"""OAuth bearer token and JWKS validation boundary."""

from __future__ import annotations

import asyncio
import time

import httpx
from authlib.jose import JsonWebKey, jwt as jose_jwt
from authlib.jose.errors import JoseError

from app.auth.subject import Subject
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import SubjectType

# Module-level in-memory JWKS cache.
# Keys: "keys" (the JWKS dict) and "fetched_at" (time.monotonic() float).
_jwks_cache: dict[str, object] = {}
_jwks_lock = asyncio.Lock()


def _reset_cache() -> None:
    """Clear the module-level JWKS cache. Intended for use in tests only."""
    _jwks_cache.clear()


async def _fetch_jwks(url: str) -> dict:
    """Fetch the JWKS document from the given URL.

    Creates a fresh httpx.AsyncClient per call to avoid shared state.

    Raises:
        ValueError: On any network or HTTP error.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except Exception:
        raise ValueError("invalid bearer token")


async def _get_jwks(settings: Settings) -> dict:
    """Return cached JWKS or fetch fresh ones if the cache has expired."""
    async with _jwks_lock:
        now = time.monotonic()
        fetched_at = _jwks_cache.get("fetched_at")
        if (
            fetched_at is None
            or (now - fetched_at) >= settings.jwt_jwks_cache_ttl_seconds  # type: ignore[operator]
        ):
            jwks_data = await _fetch_jwks(settings.jwt_jwks_url)  # type: ignore[arg-type]
            _jwks_cache["keys"] = jwks_data
            _jwks_cache["fetched_at"] = now

    return _jwks_cache["keys"]  # type: ignore[return-value]


async def verify_jwt(raw_token: str, settings: Settings) -> Subject:
    """Verify a raw JWT bearer token against the configured JWKS endpoint.

    Args:
        raw_token: The raw JWT string (without "Bearer " prefix).
        settings: The application settings instance.

    Returns:
        An authenticated Subject carrying the JWT ``sub`` claim and scopes.

    Raises:
        ValueError: If JWT auth is not configured (no ``jwt_jwks_url``).
        ValueError: On any validation failure — bad format, expired token,
            wrong audience/issuer, missing sub, or JWKS fetch error.
    """
    if settings.jwt_jwks_url is None:
        raise ValueError("JWT auth is not configured")

    try:
        jwks_data = await _get_jwks(settings)

        jwks = JsonWebKey.import_key_set(jwks_data)

        claims_options: dict[str, object] = {
            "exp": {"essential": True},
        }
        if settings.jwt_audience:
            claims_options["aud"] = {"essential": True, "values": [settings.jwt_audience]}
        if settings.jwt_issuer:
            claims_options["iss"] = {"essential": True, "value": settings.jwt_issuer}

        payload = jose_jwt.decode(raw_token, jwks, claims_options=claims_options)
        payload.validate()

        sub = payload.get("sub")
        if not sub:
            raise ValueError("invalid bearer token")

        scope_str = payload.get("scope", "")
        scopes = frozenset(scope_str.split()) if scope_str else frozenset()

        return Subject(
            subject_id=sub,
            subject_type=SubjectType.OAUTH_SUBJECT,
            tenant_id=DEFAULT_TENANT_ID,
            scopes=scopes,
        )
    except ValueError as exc:
        # Normalize all ValueErrors to a single safe message, except for errors
        # we already raised ourselves (JWT auth not configured, missing sub).
        if str(exc) in {"invalid bearer token", "JWT auth is not configured"}:
            raise
        raise ValueError("invalid bearer token") from exc
    except Exception:
        raise ValueError("invalid bearer token")
