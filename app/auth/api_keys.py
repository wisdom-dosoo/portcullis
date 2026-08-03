"""API key issuance, hashing, and revocation boundary."""

from __future__ import annotations

import asyncio
import re
import secrets
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.subject import IssuedKey, Subject
from app.repositories.api_keys import ApiKeyRepository

# Key format: pk_{8-char prefix}_{43-char secret}
# URL-safe base64 alphabet: A-Za-z0-9-_
_PREFIX_BYTES = 6  # → 8 URL-safe base64 chars
_SECRET_BYTES = 32  # → 43 URL-safe base64 chars
_KEY_MARKER = "pk"

# Regex: "pk_" + 8 URL-safe base64 chars + "_" + 43 URL-safe base64 chars
_KEY_RE = re.compile(r"^pk_([A-Za-z0-9\-_]{8})_([A-Za-z0-9\-_]{43})$")


def _make_ph(ph: PasswordHasher | None) -> PasswordHasher:
    return ph if ph is not None else PasswordHasher()


def parse_key(raw: str) -> tuple[str, str]:
    """Parse ``pk_{prefix}_{secret}`` into ``(prefix, secret)``.

    Uses a fixed-length regex so embedded underscores in prefix/secret are
    handled correctly.

    Raises:
        ValueError: If the key is malformed for any reason (uniform message).
    """
    m = _KEY_RE.match(raw)
    if m is None:
        raise ValueError("invalid API key format")
    return m.group(1), m.group(2)


async def issue_key(
    name: str,
    scopes: list[str],
    pepper: str,
    session: AsyncSession,
    tenant_id: UUID,
    ph: PasswordHasher | None = None,
) -> IssuedKey:
    """Generate, hash, persist, and return a new API key.

    The plaintext is returned once in the ``IssuedKey`` and is never stored.
    """
    hasher = _make_ph(ph)

    prefix = secrets.token_urlsafe(_PREFIX_BYTES)
    secret = secrets.token_urlsafe(_SECRET_BYTES)
    plaintext = f"{_KEY_MARKER}_{prefix}_{secret}"

    key_hash = hasher.hash(secret + pepper)

    repo = ApiKeyRepository(session)
    api_key = await repo.create(
        tenant_id=tenant_id,
        name=name,
        key_prefix=prefix,
        key_hash=key_hash,
        scopes=scopes,
    )
    await session.commit()

    return IssuedKey(
        key_id=api_key.id,
        plaintext=plaintext,
        prefix=prefix,
        scopes=frozenset(scopes),
    )


async def verify_key(
    raw: str,
    pepper: str,
    session: AsyncSession,
    ph: PasswordHasher | None = None,
) -> Subject:
    """Verify a raw API key and return the authenticated Subject.

    Raises:
        ValueError: On any authentication failure (uniform message).
    """
    hasher = _make_ph(ph)

    try:
        prefix, secret = parse_key(raw)
    except ValueError:
        raise ValueError("invalid API key")

    repo = ApiKeyRepository(session)
    api_key = await repo.get_by_prefix(prefix)
    if api_key is None:
        raise ValueError("invalid API key")

    try:
        hasher.verify(api_key.key_hash, secret + pepper)
    except (VerifyMismatchError, VerificationError):
        raise ValueError("invalid API key")

    subject = Subject(
        key_id=api_key.id,
        tenant_id=api_key.tenant_id,
        scopes=frozenset(api_key.scopes),
    )

    # Fire-and-forget: update last_used_at without blocking the caller.
    asyncio.create_task(repo.update_last_used(api_key.id))

    return subject


async def revoke_key(key_id: UUID, tenant_id: UUID, session: AsyncSession) -> None:
    """Revoke an API key by its ID within a tenant.

    Raises:
        KeyError: If the key does not exist or is already revoked.
    """
    repo = ApiKeyRepository(session)
    found = await repo.revoke(key_id, tenant_id)
    if not found:
        raise KeyError(key_id)
    await session.commit()
