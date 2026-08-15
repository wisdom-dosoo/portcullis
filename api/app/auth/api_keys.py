"""API key issuance, hashing, and revocation boundary."""

from __future__ import annotations

import re
import secrets
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.subject import IssuedKey, Subject
from app.models.orm import SubjectType
from app.repositories.api_keys import ApiKeyRepository

# Key format: pk_{8-char prefix}_{43-char secret}
# URL-safe base64 alphabet: A-Za-z0-9-_
_PREFIX_BYTES = 6  # → 8 URL-safe base64 chars
_SECRET_BYTES = 32  # → 43 URL-safe base64 chars
_KEY_MARKER = "pk"

# Regex: "pk_" + 8 URL-safe base64 chars + "_" + 43 URL-safe base64 chars
_KEY_RE = re.compile(r"^pk_([A-Za-z0-9\-_]{8})_([A-Za-z0-9\-_]{43})$")

# Timing defense: dummy hash used when no prefix row is found, so that
# both "prefix not found" and "wrong secret" paths take the same time.
_DUMMY_HASH: str = ""


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
    user_id: UUID | None = None,
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
        user_id=user_id,
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
        # Timing defense: always do a hash operation so prefix existence
        # cannot be inferred from response time.
        global _DUMMY_HASH
        if not _DUMMY_HASH:
            _DUMMY_HASH = hasher.hash("dummy-timing-defense")
        try:
            hasher.verify(_DUMMY_HASH, secret + pepper)
        except (VerifyMismatchError, VerificationError):
            pass
        raise ValueError("invalid API key")

    try:
        hasher.verify(api_key.key_hash, secret + pepper)
    except (VerifyMismatchError, VerificationError):
        raise ValueError("invalid API key")

    subject = Subject(
        subject_id=str(api_key.id),
        subject_type=SubjectType.API_KEY,
        tenant_id=api_key.tenant_id,
        scopes=frozenset(api_key.scopes),
    )

    # Update last_used_at sequentially — sharing the session with create_task
    # causes concurrent asyncpg operations on the same connection, which
    # raises InterfaceError.  The extra ~1 ms is negligible next to Argon2.
    # Commit explicitly: without it the update is rolled back when the request
    # session closes and usage tracking would silently never persist.
    await repo.update_last_used(api_key.id)
    await session.commit()

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
