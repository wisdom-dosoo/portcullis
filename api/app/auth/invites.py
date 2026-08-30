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

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.email import EmailMessageData, build_email_provider
from app.models.orm import Invitation, InvitationStatus, OrgRole
from app.repositories.invitations import InvitationRepository

# Avoid ambiguous characters when humans transcribe codes (no 0/O/1/l/I).
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_GROUPS = 3
_GROUP_LEN = 4
_CODE_RE: Pattern[str] = re.compile(rf"^[{_ALPHABET}]{{{_CODE_GROUPS * _GROUP_LEN}}}$")

logger = structlog.get_logger(__name__)


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


def _invitation_email_html(
    org_name: str, code: str, role: str, expires_in_days: int | None, base_url: str
) -> str:
    """Generate HTML email for invitation."""
    expires_text = f"expires in {expires_in_days} days" if expires_in_days else "does not expire"
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">You're invited to {org_name}</h1>
    </div>
    <div style="background: #f9fafb; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 16px; margin-bottom: 16px;">You've been invited to join <strong>{org_name}</strong> as a <strong>{role}</strong>.</p>
        <p style="font-size: 16px; margin-bottom: 24px;">Your invitation code:</p>
        <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; font-family: monospace; font-size: 20px; font-weight: 600; letter-spacing: 2px; color: #374151;">
            {code}
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 16px;">This code {expires_text}.</p>
        <p style="font-size: 14px; color: #6b7280;">To accept the invitation, visit <a href="{base_url}/onboarding" style="color: #667eea; text-decoration: none;">the onboarding page</a> and enter the code above.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
</body>
</html>
"""


def _invitation_email_text(
    org_name: str, code: str, role: str, expires_in_days: int | None, base_url: str
) -> str:
    """Generate plain text email for invitation."""
    expires_text = f"expires in {expires_in_days} days" if expires_in_days else "does not expire"
    return f"""
You're invited to {org_name}

You've been invited to join {org_name} as a {role}.

Your invitation code: {code}

This code {expires_text}.

To accept the invitation, visit {base_url}/onboarding and enter the code above.

If you didn't expect this invitation, you can safely ignore this email.
"""


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
        role: OrgRole = OrgRole.DEVELOPER,
        settings: Settings | None = None,
        base_url: str | None = None,
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
            role=role,
        )

        # Send invitation email if email is provided and email provider is configured
        if email and settings:
            try:
                provider = build_email_provider(settings)
                base = base_url or settings.sso_public_base_url or "https://portcullis.example.com"
                html_body = _invitation_email_html(
                    org_name, code, role.value, expires_in_days, base
                )
                text_body = _invitation_email_text(
                    org_name, code, role.value, expires_in_days, base
                )
                message = EmailMessageData(
                    to=[email],
                    subject=f"Invitation to join {org_name} on Portcullis",
                    html_body=html_body,
                    text_body=text_body,
                )
                await provider.send(message)
                await provider.close()
                logger.info("invite.email_sent", email=email, org_name=org_name)
            except Exception as exc:  # noqa: BLE001 - email failures should not block invitation creation
                logger.warning("invite.email_failed", email=email, error=str(exc))

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
