"""Clerk session sync endpoint boundary.

``POST /auth/clerk/sync`` exchanges a validated Clerk session JWT for a
Portcullis cookie session. The caller sends the Clerk JWT as
``Authorization: Bearer <clerk-jwt>`` (a Bearer header also exempts the
call from the cookie CSRF gate); the endpoint validates it against the
configured JWKS, resolves the verified email (Clerk Backend API when
``CLERK_SECRET_KEY`` is set, else the token's ``email`` claim), links or
creates a User + OrgMember exactly like the OIDC SSO flow, issues a
user-bound API key, and sets the HttpOnly ``portcullis_auth`` cookie.

Downstream endpoints then work unchanged — the dashboard keeps using the
cookie session, and Clerk remains the identity layer (signup, login,
Google OAuth, verification emails).
"""

from __future__ import annotations

import secrets
from typing import Annotated

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.api_keys import issue_key
from app.auth.jwt_validator import verify_jwt_with_claims
from app.auth.org_bootstrap import bind_owner_to_org_owner, create_default_roles
from app.auth.passwords import PasswordService
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import OrgMemberRole, OrgRole, UserApprovalStatus
from app.models.schemas import AuthResponse, OrgMemberCreate, UserView
from app.repositories.org_members import OrgMemberRepository
from app.repositories.users import UserRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth/clerk", tags=["clerk"])

_CLERK_API_BASE = "https://api.clerk.com/v1"


async def _resolve_email(
    sub: str, claims: dict, settings: Settings
) -> tuple[str, str]:
    """Return ``(email, full_name)`` for a Clerk user id.

    Prefers the verified primary email from the Clerk Backend API (requires
    ``CLERK_SECRET_KEY``); falls back to the token's ``email`` claim, which
    exists only with a custom Clerk JWT template.
    """
    full_name = str(claims.get("name") or "").strip()

    if settings.clerk_secret_key:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{_CLERK_API_BASE}/users/{sub}",
                    headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.warning("clerk.user_fetch_failed", error=str(exc))
            data = {}
        emails = data.get("email_addresses") or []
        primary_id = data.get("primary_email_address_id")
        verified = [
            e
            for e in emails
            if isinstance(e, dict)
            and (e.get("verification") or {}).get("status") == "verified"
        ]
        pick = next(
            (e for e in verified if e.get("id") == primary_id),
            verified[0] if verified else None,
        )
        if pick and str(pick.get("email_address") or "").strip():
            email = str(pick["email_address"]).strip().lower()
            if not full_name:
                first = str(data.get("first_name") or "").strip()
                last = str(data.get("last_name") or "").strip()
                full_name = " ".join(p for p in (first, last) if p).strip()
            return email, full_name

    email = str(claims.get("email") or "").strip().lower()
    if email:
        return email, full_name
    raise HTTPException(
        status_code=400,
        detail="Clerk account has no verified email address",
    )


@router.post("/sync", response_model=AuthResponse)
async def clerk_sync(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    response: Response,
    authorization: str = Header(default=""),
) -> AuthResponse:
    """Validate a Clerk session JWT and return a Portcullis session."""
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw or raw.startswith("pk_"):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")
    if not settings.jwt_jwks_url:
        raise HTTPException(
            status_code=503, detail="Clerk authentication is not configured"
        )

    try:
        subject, claims = await verify_jwt_with_claims(raw, settings)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")

    email, full_name = await _resolve_email(subject.subject_id, claims, settings)

    repo = UserRepository(session)
    member_repo = OrgMemberRepository(session)

    # 1. Known Clerk subject → resolve its user.
    member = await member_repo.get_by_subject(DEFAULT_TENANT_ID, subject.subject_id)
    if member is not None:
        user = await repo.get_by_email(DEFAULT_TENANT_ID, email)
        if user is None or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid or missing credentials")
        return await _issue_session(
            session, response, settings, user.id, user.email, is_owner=False
        )

    # 2. Known email → link the Clerk subject.
    user = await repo.get_by_email(DEFAULT_TENANT_ID, email)
    if user is not None:
        if user.approval_status is UserApprovalStatus.PENDING:
            raise HTTPException(
                status_code=403,
                detail="Your account is pending approval by an organization admin.",
            )
        if user.approval_status is UserApprovalStatus.REJECTED:
            raise HTTPException(status_code=403, detail="Your account has been denied.")
        if not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid or missing credentials")
        member_count = await member_repo.count(DEFAULT_TENANT_ID)
        linked_role = (
            OrgMemberRole.ORG_OWNER if member_count == 0 else OrgMemberRole.DEVELOPER
        )
        await member_repo.create(
            DEFAULT_TENANT_ID,
            OrgMemberCreate(user_subject=subject.subject_id, admin_role=linked_role),
        )
        return await _issue_session(
            session, response, settings, user.id, user.email, is_owner=False
        )

    # 3. Fresh signup — auto-provision (first member owns the system).
    passwords = PasswordService(
        settings.active_pepper, fallback_pepper=settings.api_key_pepper
    )
    is_first = await member_repo.count(DEFAULT_TENANT_ID) == 0
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email=email,
        password_hash=passwords.hash_password(secrets.token_urlsafe(32)),
        full_name=full_name or email,
        org_name=None,
        intended_use=None,
        approval_status=UserApprovalStatus.APPROVED,
        org_role=OrgRole.ORG_OWNER if is_first else OrgRole.DEVELOPER,
    )
    await session.flush()
    await create_default_roles(session, DEFAULT_TENANT_ID)
    await member_repo.create(
        DEFAULT_TENANT_ID,
        OrgMemberCreate(
            user_subject=subject.subject_id,
            admin_role=OrgMemberRole.ORG_OWNER if is_first else OrgMemberRole.DEVELOPER,
        ),
    )
    return await _issue_session(
        session, response, settings, user.id, user.email, is_owner=is_first
    )


async def _issue_session(
    session: AsyncSession,
    response: Response,
    settings: Settings,
    user_id,
    email: str,
    is_owner: bool,
) -> AuthResponse:
    """Issue a user-bound key, set the session cookie, return AuthResponse."""
    issued = await issue_key(
        name=f"user:{email}",
        scopes=[],
        pepper=settings.active_pepper,
        session=session,
        tenant_id=DEFAULT_TENANT_ID,
        user_id=user_id,
    )
    if is_owner:
        # Bind the owner's key to the org_owner tool role (mirrors register).
        await bind_owner_to_org_owner(session, DEFAULT_TENANT_ID, issued.key_id)
    await session.commit()

    user = await UserRepository(session).get_by_id(DEFAULT_TENANT_ID, user_id)
    auth = AuthResponse(
        access_token=issued.plaintext,
        token_type="bearer",
        user=UserView.model_validate(user),
    )
    is_production = settings.environment.value == "production"
    response.set_cookie(
        "portcullis_auth",
        auth.access_token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
        secure=is_production,
        path="/",
    )
    return auth
