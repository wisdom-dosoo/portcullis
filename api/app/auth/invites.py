"""Invitation code minting, verification, and revocation boundary.

Meaningfully different from API keys: invite codes are short and typed by
humans, so they cannot carry a long random prefix+secret.  We therefore hash
the code with HMAC-SHA256 keyed by the server pepper — deterministic (enables
exact-equality DB lookup) and unguessable without the pepper, so a database
leak cannot be used to enumerate valid codes.  The plaintext is returned once
and never stored.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta
from re import Pattern
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Invitation, InvitationStatus
from app.repositories.invitations import InvitationRepository

# Avoid ambiguous characters when humans transcribe codes (no 0/O/1/l/I).
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_GROUPS = 3
_GROUP_LEN = 4
_CODE_RE: Pattern[str] = re.compile(rf"^[{_ALPHABET}]{{{_CODE_GROUPS * _GROUP_LEN}}}$")


def _hash_code(code: str, pepper: str) -> str:
    """Return the deterministic HMAC-SHA256 hash of a normalized invite code."""
    return hmac.new(
        pepper.encode("utf-8"),
        msg=code.encode("ascii"),
        digestmod=hashlib.sha256,
    ).hexdigest()


def normalize_code(raw: str) -> str:
    """Strip separators, uppercase, and validate the invite code format.

    Accepts dashed (``XXXX-XXXX-XXXX``) or undashed (``XXXXXXXXXXXX``) input.
    """
    compact = raw.strip().upper().replace("-", "").replace(" ", "")
    if not _CODE_RE.match(compact):
        raise ValueError("invalid invitation code")
    return compact


class InviteLookupError(ValueError):
    """Raised when an invitation code is unknown or no longer redeemable."""


class InviteService:
    """High-level operations over invitation codes."""

    @staticmethod
    def generate_code() -> str:
        """Generate a human-friendly code in ``XXXX-XXXX-XXXX`` form."""
        chars = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_GROUPS * _GROUP_LEN))
        return "-".join(chars[i : i + _GROUP_LEN] for i in range(0, len(chars), _GROUP_LEN))

    async def mint(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        org_name: str,
        pepper: str,
        created_by: UUID | None = None,
        email: str | None = None,
        expires_in_days: int | None = None,
    ) -> tuple[Invitation, str]:
        """Create a new invitation and return ``(invitation, plaintext_code)``."""
        code = self.generate_code()
        expires_at = (
            datetime.now(UTC) + timedelta(days=expires_in_days)
            if expires_in_days is not None
            else None
        )
        repo = InvitationRepository(session)
        invitation = await repo.create(
            tenant_id=tenant_id,
            code_hash=_hash_code(code, pepper),
            org_name=org_name,
            created_by=created_by,
            email=email,
            expires_at=expires_at,
        )
        return invitation, code

    async def find_active(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        code: str,
        pepper: str,
    ) -> Invitation:
        """Return the redeemable invitation matching ``code`` or raise.

        Raises:
            InviteLookupError: if the code is malformed, unknown, revoked,
                               expired, or already used.  Malformed input and
                               unknown codes share the same message so the code
                               cannot be probed by charset discovery.
        """
        try:
            normalized = normalize_code(code)
        except ValueError:
            raise InviteLookupError("invalid invitation code")

        repo = InvitationRepository(session)
        invitation = await repo.get_by_code_hash(tenant_id, _hash_code(normalized, pepper))
        if invitation is None:
            raise InviteLookupError("invalid invitation code")

        if invitation.status != InvitationStatus.ACTIVE:
            raise InviteLookupError("invalid invitation code")
        if invitation.expires_at is not None and invitation.expires_at < datetime.now(UTC):
            raise InviteLookupError("invalid invitation code")
        return invitation
