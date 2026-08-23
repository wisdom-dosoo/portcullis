"""OIDC authorization-code SSO boundary.

Implements the authorization-code flow against a single config-driven OpenID
Connect provider.  The IdP client secret lives only in process configuration —
never in the database — so self-hosted deployments point these settings at
their own IdP, and the Cloud control plane supplies them per-tenant.  Nothing
here is gated: SSO simply is unavailable when the provider is not configured.

Flow:
  1. ``GET /auth/sso/{slug}/login`` — validate state, store it in a short-lived
     signed cookie, redirect to the IdP authorization endpoint.
  2. IdP redirects back to ``GET /auth/sso/{slug}/callback`` with ``code``.
  3. Exchange ``code`` for tokens at the token endpoint, fetch userinfo,
     link-or-create a User + OrgMember by email, issue a user-bound API key,
     and redirect the browser to the dashboard with the one-time token.
"""

from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import Settings

# Signed-state cookie parameters.
_STATE_COOKIE_NAME = "portcullis_sso_state"


class SsoError(ValueError):
    """Raised on any SSO configuration or exchange failure."""


def _sign(value: str, pepper: str) -> str:
    """Return a keyed signature for the given value."""
    return hmac.new(
        b"portcullis-sso-state",
        value.encode("utf-8"),
        digestmod="sha256",
    ).hexdigest() + hmac.new(
        pepper.encode("utf-8"), value.encode("utf-8"), digestmod="sha256"
    ).hexdigest()


def _verify(value: str, signature: str, pepper: str) -> bool:
    """Return True when the signature matches the value for the given pepper."""
    expected = _sign(value, pepper)
    return hmac.compare_digest(signature, expected)


def make_state(settings: Settings) -> str:
    """Return an opaque, signed SSO state value for the auth-code flow."""
    nonce = secrets.token_urlsafe(24)
    return f"{nonce}.{_sign(nonce, settings.api_key_pepper)}"


def verify_state(state: str, settings: Settings) -> bool:
    """Return True if the state was minted by this server and is well-formed."""
    if not state or "." not in state:
        return False
    nonce, signature = state.rsplit(".", 1)
    return _verify(nonce, signature, settings.api_key_pepper)


def state_cookie_domain(settings: Settings) -> str:
    """Return the host the state cookie should be scoped to.

    Derives from the public base URL so the cookie is valid on whatever host
    the dashboard is served from (localhost in dev, the Cloud domain in prod).
    """
    host = settings.sso_public_base_url.removeprefix("http://").removeprefix("https://")
    return host.split(":", 1)[0]


def authorization_url(settings: Settings, state: str) -> str:
    """Build the IdP authorization URL for the configured provider.

    Raises:
        SsoError: If SSO is not configured (missing client id / authorize URL).
    """
    _require_configured(settings)
    assert settings.sso_oidc_authorize_url is not None  # guaranteed by check
    redirect_uri = callback_url(settings)
    params = {
        "response_type": "code",
        "client_id": settings.sso_oidc_client_id or "",
        "redirect_uri": redirect_uri,
        "scope": settings.sso_oidc_scope,
        "state": state,
    }
    separator = "&" if "?" in settings.sso_oidc_authorize_url else "?"
    return f"{settings.sso_oidc_authorize_url}{separator}{urlencode(params)}"


def callback_url(settings: Settings) -> str:
    """Return the callback URL the IdP redirects the browser to."""
    base = settings.sso_public_base_url.rstrip("/")
    return f"{base}/auth/sso/{settings.sso_oidc_slug}/callback"


async def exchange_code(settings: Settings, code: str) -> dict:
    """Exchange the authorization code for an access token at the IdP.

    Returns the parsed token response.  Raises ``SsoError`` on failure.
    """
    _require_configured(settings)
    assert settings.sso_oidc_token_url is not None
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": callback_url(settings),
        "client_id": settings.sso_oidc_client_id or "",
        "client_secret": settings.sso_oidc_client_secret or "",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(settings.sso_oidc_token_url, data=payload)
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        raise SsoError("failed to exchange authorization code") from exc


async def fetch_userinfo(settings: Settings, access_token: str) -> dict:
    """Fetch the IdP userinfo claims with the given access token.

    Raises ``SsoError`` on any failure.
    """
    _require_configured(settings)
    assert settings.sso_oidc_userinfo_url is not None
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(settings.sso_oidc_userinfo_url, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        raise SsoError("failed to fetch userinfo") from exc


@dataclass(frozen=True)
class SsoIdentity:
    """Normalized identity claims extracted from the IdP userinfo response."""

    subject: str
    email: str
    full_name: str

    @classmethod
    def from_userinfo(cls, userinfo: dict, settings: Settings) -> SsoIdentity:
        """Extract and validate identity claims from an IdP userinfo payload."""
        subject = userinfo.get("sub")
        email = (userinfo.get("email") or "").strip().lower()
        full_name = (
            userinfo.get("name")
            or " ".join(
                part
                for part in (userinfo.get("given_name"), userinfo.get("family_name"))
                if part
            )
            or ""
        ).strip()
        if not subject:
            raise SsoError("identity provider returned no 'sub' claim")
        if not email:
            raise SsoError("identity provider returned no email")
        if settings.sso_oidc_issuer:
            token_issuer = userinfo.get("iss")
            if token_issuer and token_issuer != settings.sso_oidc_issuer:
                raise SsoError("identity provider issuer mismatch")
        return cls(subject=subject, email=email, full_name=full_name)


__all__ = [
    "SsoError",
    "SsoIdentity",
    "authorization_url",
    "callback_url",
    "exchange_code",
    "fetch_userinfo",
    "make_state",
    "state_cookie_domain",
    "verify_state",
]


def _require_configured(settings: Settings) -> None:
    """Raise SsoError if the OIDC provider is not fully configured."""
    if not settings.sso_enabled:
        raise SsoError("SSO is not enabled")
    if not settings.sso_oidc_client_id or not settings.sso_oidc_client_secret:
        raise SsoError("SSO client credentials are not configured")
    if not settings.sso_oidc_authorize_url:
        raise SsoError("SSO authorization endpoint is not configured")
    if not settings.sso_oidc_token_url:
        raise SsoError("SSO token endpoint is not configured")
    if not settings.sso_oidc_userinfo_url:
        raise SsoError("SSO userinfo endpoint is not configured")