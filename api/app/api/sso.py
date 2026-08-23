"""OIDC SSO login and callback endpoint boundary.

Two public routes complete the authorization-code flow against the
config-driven provider:

  * ``GET /auth/sso/{slug}/login`` — validates the slug, mints + signs a
    state value, stores it in a short-lived cookie, and 302s to the IdP.
  * ``GET /auth/sso/{slug}/callback`` — verifies state + ``code``, exchanges
    it, fetches userinfo, links-or-creates a User/OrgMember by email, issues a
    user-bound API key, and 302s the browser to ``/sso-callback?token=...``.

``slug`` must match the configured provider slug, so a self-host can only
exercise the flow against the IdP the operator configured.
"""

from __future__ import annotations

import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.api_keys import issue_key
from app.auth.org_bootstrap import create_default_roles
from app.auth.passwords import PasswordService
from app.auth.sso import (
    SsoError,
    SsoIdentity,
    authorization_url,
    exchange_code,
    fetch_userinfo,
    make_state,
    state_cookie_domain,
    verify_state,
)
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import OrgRole, UserApprovalStatus
from app.models.schemas import OrgMemberCreate
from app.repositories.org_members import OrgMemberRepository
from app.repositories.users import UserRepository

router = APIRouter(prefix="/auth/sso", tags=["sso"])

_STATE_COOKIE = "portcullis_sso_state"
_DASHBOARD_REDIRECT = "/sso-callback"


def _redirect_target(token: str) -> str:
    """Build the dashboard redirect URL carrying the one-time token."""
    return f"{_DASHBOARD_REDIRECT}?token={token}"


@router.get("/{slug}/login")
async def sso_login(
    slug: str,
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> Response:
    """Start the OIDC authorization-code flow (public redirect endpoint)."""
    _ensure_slug(slug, settings)
    try:
        state = make_state(settings)
    except SsoError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    response = RedirectResponse(authorization_url(settings, state), status_code=302)
    response.set_cookie(
        _STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=settings.environment.value == "production",
        path="/",
        domain=state_cookie_domain(settings),
    )
    return response


@router.get("/{slug}/callback")
async def sso_callback(
    slug: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    settings: Annotated[Settings, Depends(get_settings_dep)] = None,  # type: ignore[assignment]
    session: Annotated[AsyncSession, Depends(get_session)] = None,  # type: ignore[assignment]
) -> Response:
    """Complete the OIDC flow and redirect the browser with a one-time token."""
    _ensure_slug(slug, settings)

    if error:
        raise HTTPException(status_code=400, detail=error_description or error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing authorization code or state")

    cookie_state = request.cookies.get(_STATE_COOKIE)
    if not cookie_state or not verify_state(cookie_state, settings) or cookie_state != state:
        raise HTTPException(status_code=400, detail="Invalid or expired SSO state")

    try:
        token_response = await exchange_code(settings, code)
        userinfo = await fetch_userinfo(settings, token_response["access_token"])
    except (SsoError, KeyError) as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    identity = SsoIdentity.from_userinfo(userinfo, settings)

    try:
        access_token = await _link_or_create(identity, session, settings)
    except SsoError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    redirect = RedirectResponse(_redirect_target(access_token), status_code=302)
    redirect.delete_cookie(_STATE_COOKIE, path="/", domain=state_cookie_domain(settings))
    return redirect


async def _link_or_create(
    identity: SsoIdentity, session: AsyncSession, settings: Settings
) -> str:
    """Link-or-create a User + OrgMember for the SSO identity and return a token.

    If a User already exists with the identity email (in the default tenant),
    the flow just issues a fresh user-bound API key.  Otherwise a new approved
    User + org_owner OrgMember is created (mirroring the ``create`` register
    flow) and linked by the OAuth ``sub`` so subsequent logins match by
    subject first, then by email.
    """
    repo = UserRepository(session)
    member_repo = OrgMemberRepository(session)

    # 1. Existing OrgMember by OAuth sub → resolve its user.
    member = await member_repo.get_by_subject(DEFAULT_TENANT_ID, identity.subject)
    if member is not None:
        user = await repo.get_by_email(DEFAULT_TENANT_ID, identity.email)
        if user is None or not user.is_active:
            raise SsoError("account is disabled")
        return await _issue_token(session, user.id, user.email, settings)

    # 2. Existing user by email → link subject to that account.
    user = await repo.get_by_email(DEFAULT_TENANT_ID, identity.email)
    if user is not None:
        if user.approval_status is not UserApprovalStatus.APPROVED:
            raise SsoError("account is pending approval or was denied")
        if not user.is_active:
            raise SsoError("account is disabled")
        await member_repo.create(
            DEFAULT_TENANT_ID,
            OrgMemberCreate(user_subject=identity.subject, admin_role=OrgRole.ORG_OWNER.value),
        )
        return await _issue_token(session, user.id, user.email, settings)

    # 3. No user — auto-provision an approved org owner.
    passwords = PasswordService(settings.api_key_pepper)
    password_hash = passwords.hash_password(_generated_password())
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email=identity.email,
        password_hash=password_hash,
        full_name=identity.full_name,
        org_name=None,
        intended_use=None,
        approval_status=UserApprovalStatus.APPROVED,
        org_role=OrgRole.ORG_OWNER,
    )
    await session.flush()
    await create_default_roles(session, DEFAULT_TENANT_ID)
    await member_repo.create(
        DEFAULT_TENANT_ID,
        OrgMemberCreate(user_subject=identity.subject, admin_role=OrgRole.ORG_OWNER.value),
    )
    return await _issue_token(session, user.id, user.email, settings)


def _ensure_slug(slug: str, settings: Settings) -> None:
    """Raise 404 unless the slug matches the configured provider."""
    if not settings.sso_enabled or slug != settings.sso_oidc_slug:
        raise HTTPException(status_code=404, detail="SSO provider not found")


async def _issue_token(session: AsyncSession, user_id: UUID, email: str, settings: Settings) -> str:
    issued = await issue_key(
        name=f"user:{email}",
        scopes=[],
        pepper=settings.api_key_pepper,
        session=session,
        tenant_id=DEFAULT_TENANT_ID,
        user_id=user_id,
    )
    await session.commit()
    return issued.plaintext


def _generated_password() -> str:
    """Return a strong, unguessable one-time password for auto-provisioned users."""
    return secrets.token_urlsafe(32)