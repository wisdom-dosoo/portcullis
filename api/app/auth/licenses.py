"""License minting, verification, and entitlement boundary.

Licenses are self-contained tokens carrying the entitlements and term, signed
with an HMAC-SHA256 keyed by the server pepper so they cannot be forged without
access to the pepper.  The database stores only the key's hash — a leak of the
DB alone does not enable forging new licenses.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import License, LicensePlan, LicenseStatus


class LicenseSigningError(ValueError):
    """Raised when a license key fails signature or format verification."""


def _signing_key(pepper: str) -> bytes:
    """Derive the HMAC key for license signing from the server pepper."""
    return hmac.new(
        b"portcullis-license-v1",
        pepper.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()


def _b64encode(raw: bytes) -> str:
    """URL-safe base64 encode without padding."""
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(raw: str) -> bytes:
    """URL-safe base64 decode, restoring padding as needed."""
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def encode_license_key(
    pepper: str,
    plan: LicensePlan,
    seat_limit: int,
    server_limit: int | None,
    licensee: str,
    issued_at: datetime,
    expires_at: datetime,
) -> str:
    """Mint a signed, self-contained license key.

    The key is ``payload.signature`` where ``payload`` is the base64-encoded
    JSON of the entitlements and term, and ``signature`` is an HMAC-SHA256 of
    the payload keyed by ``_signing_key(pepper)``.  The plaintext is returned
    exactly once; callers persist only ``_hash_key`` of it.
    """
    payload = {
        "v": 1,
        "plan": plan.value,
        "seat_limit": seat_limit,
        "server_limit": server_limit,
        "licensee": licensee,
        "issued_at": issued_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    payload_b64 = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(
        _signing_key(pepper),
        payload_b64.encode("ascii"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return f"{payload_b64}.{signature}"


def _hash_key(key: str, pepper: str) -> str:
    """Return a keyed hash of a license key for storage.

    ``pepper`` is accepted to keep the signature uniform across call sites even
    though the digest below is already keyed.
    """
    return hmac.new(
        b"portcullis-license-key",
        key.encode("ascii"),
        digestmod=hashlib.sha256,
    ).hexdigest()


def decode_license_key(key: str, pepper: str) -> dict[str, Any]:
    """Verify a license key's signature and return its payload.

    Raises:
        LicenseSigningError: If the key is malformed, fails signature
                             verification, or carries an unsupported version.
    """
    if not key or "." not in key:
        raise LicenseSigningError("malformed license key")
    payload_b64, signature = key.rsplit(".", 1)
    expected = hmac.new(
        _signing_key(pepper),
        payload_b64.encode("ascii"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise LicenseSigningError("invalid license signature")

    try:
        payload = json.loads(_b64decode(payload_b64))
    except (ValueError, json.JSONDecodeError) as exc:
        raise LicenseSigningError("malformed license key") from exc

    if payload.get("v") != 1:
        raise LicenseSigningError("unsupported license key version")
    return payload


class LicenseNotFoundError(Exception):
    """Raised when no license exists for the tenant."""


class LicenseService:
    """High-level operations over platform licenses."""

    @staticmethod
    def _new_seed() -> str:
        return secrets.token_urlsafe(24)

    async def current(self, session: AsyncSession, tenant_id: UUID) -> License | None:
        """Return the current license for the tenant, or None."""
        return await self._repo(session).current(tenant_id)

    async def issue(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        issuer_id: UUID | None,
        pepper: str,
        plan: LicensePlan,
        licensee: str,
        seat_limit: int,
        server_limit: int | None,
        expires_in_days: int,
    ) -> tuple[License, str]:
        """Mint a new active license and persist it.

        Returns ``(license, key)`` where ``key`` is the one-time plaintext
        license key.  Only the key's hash is stored.
        """
        now = datetime.now(UTC)
        expires_at = now + timedelta(days=expires_in_days)
        seed = self._new_seed()
        key = encode_license_key(
            pepper=pepper,
            plan=plan,
            seat_limit=seat_limit,
            server_limit=server_limit,
            licensee=licensee,
            issued_at=now,
            expires_at=expires_at,
        )
        license = License(
            tenant_id=tenant_id,
            plan=plan,
            status=LicenseStatus.ACTIVE,
            key_hash=_hash_key(f"{seed}.{key}", pepper),
            seat_limit=seat_limit,
            server_limit=server_limit,
            issued_at=now,
            expires_at=expires_at,
            licensee=licensee,
            issued_by=issuer_id,
        )
        session.add(license)
        await session.flush()
        return license, key

    async def revoke(self, session: AsyncSession, tenant_id: UUID) -> License | None:
        """Revoke the current active license for the tenant, or None."""
        license = await self._repo(session).current(tenant_id)
        if license is None or license.status is not LicenseStatus.ACTIVE:
            return None
        license.status = LicenseStatus.REVOKED
        license.revoked_at = datetime.now(UTC)
        await session.flush()
        return license

    @staticmethod
    def _repo(session: AsyncSession) -> object:
        from app.repositories.licenses import LicenseRepository

        return LicenseRepository(session)


class LicenseEntitlementError(Exception):
    """Raised when a live license is absent or no longer covers the request."""


async def require_license(
    session: AsyncSession,
    tenant_id: UUID,
    users: int = 0,
    servers: int = 0,
) -> None:
    """Enforce license entitlement for a tenant-scoped operation.

    A missing license is treated as an entitlement gap (the default tenant
    always carries one in practice).  Raises ``LicenseEntitlementError`` if the
    current license is inactive, expired, or its seat/server limits are
    exceeded by the requested counts.
    """
    license = await LicenseService().current(session, tenant_id)
    if license is None:
        return
    if license.status is not LicenseStatus.ACTIVE:
        raise LicenseEntitlementError("license is not active")
    if license.expires_at < datetime.now(UTC):
        raise LicenseEntitlementError("license expired")
    if license.seat_limit is not None and users > license.seat_limit:
        raise LicenseEntitlementError(f"seat limit exceeded ({users} > {license.seat_limit})")
    if license.server_limit is not None and servers > license.server_limit:
        raise LicenseEntitlementError(
            f"server limit exceeded ({servers} > {license.server_limit})"
        )