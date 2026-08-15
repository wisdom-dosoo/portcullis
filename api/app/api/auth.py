"""Email/password authentication and org-membership endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.api_keys import issue_key
from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.invites import InviteLookupError, InviteService
from app.auth.passwords import PasswordService
from app.auth.subject import IssuedKey, Subject
from app.config import Settings
from app.gateway.registry import DEFAULT_TENANT_ID
from app.models.orm import SubjectType, UserApprovalStatus
from app.models.schemas import (
    ApprovalDecision,
    AuthResponse,
    InviteCreate,
    InviteView,
    LoginRequest,
    RegisterRequest,
    UserView,
)
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.invitations import InvitationRepository
from app.repositories.users import UserRepository

router = APIRouter(prefix="/auth", tags=["auth"])


async def _issue_user_token(
    session: AsyncSession,
    user_id: UUID,
    email: str,
    settings: Settings,
) -> IssuedKey:
    """Issue a user-bound API key and return the one-time plaintext view."""
    return await issue_key(
        name=f"user:{email}",
        scopes=[],
        pepper=settings.api_key_pepper,
        session=session,
        tenant_id=DEFAULT_TENANT_ID,
        user_id=user_id,
    )


@router.post("/register", status_code=201, response_model=AuthResponse)
async def register(
    body: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AuthResponse:
    """Create a new user account and return a one-time access token.

    Tokens are issued immediately for ``create`` and ``invitation`` flows.
    Accounts created via ``join`` are left in the ``pending`` state without a
    token until an admin approves them.
    """
    repo = UserRepository(session)
    existing = await repo.get_by_email(DEFAULT_TENANT_ID, body.email)
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    passwords = PasswordService(settings.api_key_pepper)
    password_hash = passwords.hash_password(body.password)

    if body.flow == "invitation":
        if not body.invite_code:
            raise HTTPException(status_code=422, detail="An invitation code is required")
        return await _register_via_invite(body, password_hash, session, settings)

    # create (approved) vs join (pending)
    approval = UserApprovalStatus.APPROVED if body.flow == "create" else UserApprovalStatus.PENDING
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email=body.email,
        password_hash=password_hash,
        full_name=body.full_name,
        org_name=body.org_name,
        intended_use=body.intended_use,
        approval_status=approval,
    )
    await session.flush()

    if approval is UserApprovalStatus.PENDING:
        # No token until an admin approves the join request.
        await session.commit()
        return AuthResponse(access_token="", user=UserView.model_validate(user))

    issued = await _issue_user_token(session, user.id, user.email, settings)
    return AuthResponse(
        access_token=issued.plaintext, token_type="bearer", user=UserView.model_validate(user)
    )


async def _register_via_invite(
    body: RegisterRequest,
    password_hash: str,
    session: AsyncSession,
    settings: Settings,
) -> AuthResponse:
    """Redeem an invitation code and create an approved, org-bound user."""
    if body.invite_code is None:
        raise HTTPException(status_code=422, detail="An invitation code is required")
    invites = InviteService()
    try:
        invitation = await invites.find_active(
            session, DEFAULT_TENANT_ID, body.invite_code, settings.api_key_pepper
        )
    except InviteLookupError:
        raise HTTPException(status_code=401, detail="Invalid or expired invitation code")

    if invitation.email is not None and invitation.email != body.email:
        raise HTTPException(
            status_code=401,
            detail="This invitation is for a different email address",
        )

    org_name = invitation.org_name or body.org_name
    repo = UserRepository(session)
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email=body.email,
        password_hash=password_hash,
        full_name=body.full_name,
        org_name=org_name,
        intended_use=body.intended_use,
        approval_status=UserApprovalStatus.APPROVED,
    )
    await session.flush()

    inv_repo = InvitationRepository(session)
    if not await inv_repo.mark_redeemed(invitation.id, user.id):
        raise HTTPException(status_code=409, detail="This invitation has already been used")

    issued = await _issue_user_token(session, user.id, user.email, settings)
    return AuthResponse(
        access_token=issued.plaintext,
        token_type="bearer",
        user=UserView.model_validate(user),
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AuthResponse:
    """Authenticate an existing user and return a one-time access token."""
    repo = UserRepository(session)
    user = await repo.get_by_email(DEFAULT_TENANT_ID, body.email)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.approval_status is UserApprovalStatus.PENDING:
        raise HTTPException(
            status_code=403, detail="Your account is pending approval by an organization admin."
        )
    if user.approval_status is UserApprovalStatus.REJECTED:
        raise HTTPException(status_code=403, detail="Your account has been denied.")

    passwords = PasswordService(settings.api_key_pepper)
    if not passwords.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    issued = await _issue_user_token(session, user.id, user.email, settings)
    return AuthResponse(
        access_token=issued.plaintext, token_type="bearer", user=UserView.model_validate(user)
    )


@router.get("/me", response_model=UserView)
async def me(
    subject: Annotated[Subject, Depends(authenticated_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserView:
    """Return the user associated with the current access token."""
    if subject.subject_type is not SubjectType.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    keys = ApiKeyRepository(session)
    api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
    if api_key is None or api_key.user_id is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    repo = UserRepository(session)
    user = await repo.get_by_id(DEFAULT_TENANT_ID, api_key.user_id)
    if (
        user is None
        or not user.is_active
        or user.approval_status is not UserApprovalStatus.APPROVED
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return UserView.model_validate(user)


async def _acting_user_id(session: AsyncSession, subject: Subject) -> UUID | None:
    """Resolve the user id backing an API-key subject, or None if unbound."""
    if subject.subject_type is not SubjectType.API_KEY:
        return None
    keys = ApiKeyRepository(session)
    api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
    if api_key is None:
        return None
    return api_key.user_id


@router.post("/invites", status_code=201, response_model=InviteView)
async def create_invite(
    body: InviteCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> InviteView:
    """Mint a new invitation code for the given organization (admin only).

    The plaintext code is returned once in the response body (mirroring API
    keys) and is never stored.
    """
    invites = InviteService()
    invitation, code = await invites.mint(
        session=session,
        tenant_id=DEFAULT_TENANT_ID,
        org_name=body.org_name,
        pepper=settings.api_key_pepper,
        created_by=await _acting_user_id(session, subject),
        email=body.email,
        expires_in_days=body.expires_in_days,
    )
    await session.commit()
    view = InviteView.model_validate(invitation)
    view.code = code
    return view


@router.get("/invites", response_model=list[InviteView])
async def list_invites(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[InviteView]:
    """List all invitations for the tenant (admin only)."""
    repo = InvitationRepository(session)
    invitations = await repo.list(DEFAULT_TENANT_ID)
    return [InviteView.model_validate(i) for i in invitations]


@router.post("/invites/{invite_id}/revoke", status_code=204)
async def revoke_invite(
    invite_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Revoke an invitation code (admin only)."""
    repo = InvitationRepository(session)
    if not await repo.revoke(invite_id, DEFAULT_TENANT_ID):
        raise HTTPException(status_code=404, detail="Invitation not found or already used")
    await session.commit()


@router.get("/pending-users", response_model=list[UserView])
async def list_pending_users(
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[UserView]:
    """List users awaiting join-request approval (admin only)."""
    repo = UserRepository(session)
    users = await repo.list_by_status(DEFAULT_TENANT_ID, UserApprovalStatus.PENDING)
    return [UserView.model_validate(u) for u in users]


@router.post("/pending-users/{user_id}/approve", response_model=UserView)
async def approve_user(
    user_id: UUID,
    body: ApprovalDecision,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> UserView:
    """Approve a pending join request and issue the user their first token."""
    if body.user_id != user_id:
        raise HTTPException(status_code=422, detail="user_id mismatch")
    repo = UserRepository(session)
    user = await repo.get_by_id(DEFAULT_TENANT_ID, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not await repo.set_approval_status(DEFAULT_TENANT_ID, user_id, UserApprovalStatus.APPROVED):
        raise HTTPException(status_code=404, detail="User not found")

    issued = await _issue_user_token(session, user.id, user.email, settings)
    await session.commit()
    view = UserView.model_validate(user)
    view.access_token = issued.plaintext
    return view


@router.post("/pending-users/{user_id}/reject", status_code=204)
async def reject_user(
    user_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Reject a pending join request (admin only)."""
    repo = UserRepository(session)
    if not await repo.set_approval_status(DEFAULT_TENANT_ID, user_id, UserApprovalStatus.REJECTED):
        raise HTTPException(status_code=404, detail="User not found")
    await session.commit()
