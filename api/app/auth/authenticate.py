"""Shared bearer-token authentication dispatch boundary.

Centralises the pk_/JWT branching logic so both the JSON-RPC proxy (router.py)
and the FastAPI dependency (dependencies.py) call a single implementation.
Callers are responsible for translating ValueError into their own error format
(HTTPException for REST endpoints, JSON-RPC error for the proxy).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api_keys import verify_key
from app.auth.jwt_validator import verify_jwt
from app.auth.subject import Subject
from app.config import Settings


async def authenticate(
    raw_token: str,
    settings: Settings,
    session: AsyncSession,
) -> Subject:
    """Resolve a raw bearer token (no 'Bearer ' prefix) to an authenticated Subject.

    Dispatches on token format:
    - ``pk_`` prefix  → Argon2id API key verification (``verify_key``)
    - anything else   → JWKS JWT verification (``verify_jwt``)

    Raises:
        ValueError: On any authentication failure — missing JWKS config, invalid
            token format, bad signature, expired token, or unknown key prefix.
            The message is always an opaque sentinel; callers must not forward it
            to clients verbatim.
    """
    if raw_token.startswith("pk_"):
        return await verify_key(raw=raw_token, pepper=settings.api_key_pepper, session=session)

    if not settings.jwt_jwks_url:
        raise ValueError("invalid bearer token")

    return await verify_jwt(raw_token=raw_token, settings=settings)
