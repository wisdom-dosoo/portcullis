"""Email/password authentication and org-membership endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.admin_rbac import (
    AdminAction,
    can_invite_role,
    has_permission,
)
from app.auth.api_keys import issue_key
from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.invites import InviteLookupError, InviteService
from app.auth.licenses import LicenseEntitlementError, require_license
from app.auth.org_bootstrap import bind_owner_to_org_owner, create_default_roles
from app.auth.passwords import PasswordService
from app.auth.subject import IssuedKey, Subject
from app.config import Settings
from app.gateway.registry import DEFAULT_TENANT_ID
from app.models.orm import (
    OrgRole,
    SubjectType,
    UserApprovalStatus,
)
from app.models.schemas import (
    ApprovalDecision,
    AuthResponse,
    InviteCreate,
    InviteView,
    LoginRequest,
    OrgMemberCreate,
    OrgMemberUpdate,
    OrgMemberView,
    RegisterRequest,
    TeamCreate,
    TeamUpdate,
    TeamView,
    UserView,
)
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.invitations import InvitationRepository
from app.repositories.org_members import OrgMemberRepository
from app.repositories.teams import TeamRepository
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
    if approval is UserApprovalStatus.APPROVED:
        try:
            await require_license(
                session,
                DEFAULT_TENANT_ID,
                users=await repo.count(DEFAULT_TENANT_ID) + 1,
                servers=0,
            )
        except LicenseEntitlementError as exc:
            raise HTTPException(status_code=402, detail=str(exc)) from exc

    # For org creation (flow=create), enforce 2-organization limit for super admins
    if body.flow == "create":
        # Check if user is a super admin (platform admin) and enforce 2-org limit
        existing_user = await repo.get_by_email(DEFAULT_TENANT_ID, body.email)
        if existing_user and existing_user.is_platform_admin:
            if existing_user.created_org_count >= 2:
                raise HTTPException(
                    status_code=403,
                    detail="Super admin has reached the maximum limit of 2 organizations"
                )

    # For org creation (flow=create), assign org_owner role and set up default roles
    org_role = OrgRole.ORG_OWNER if body.flow == "create" else None
    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email=body.email,
        password_hash=password_hash,
        full_name=body.full_name,
        org_name=body.org_name,
        intended_use=body.intended_use,
        approval_status=approval,
        org_role=org_role,
    )
    await session.flush()

    # For org creation, set up default roles and track super admin org ownership
    if body.flow == "create":
        await create_default_roles(session, DEFAULT_TENANT_ID)
        
        # If the user is a super admin, increment their org count and link them to the new org
        if user.is_platform_admin:
            user.created_org_count += 1
            # Link super admin to the new organization
            from app.models.orm import SuperAdminOrganization
            session.add(SuperAdminOrganization(
                super_admin_id=user.id,
                organization_tenant_id=DEFAULT_TENANT_ID,
            ))

    if approval is UserApprovalStatus.PENDING:
        # No token until an admin approves the join request.
        await session.commit()
        return AuthResponse(access_token="", user=UserView.model_validate(user))

    issued = await _issue_user_token(session, user.id, user.email, settings)

    # Bind the owner's API key to org_owner role
    if body.flow == "create":
        await bind_owner_to_org_owner(session, DEFAULT_TENANT_ID, issued.key_id)

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

    # Enforce seat entitlement before redeeming an invite (user rows count as
    # seats here — the invite path provisions a User, not just an OrgMember).
    try:
        await require_license(
            session,
            DEFAULT_TENANT_ID,
            users=await repo.count(DEFAULT_TENANT_ID) + 1,
            servers=0,
        )
    except LicenseEntitlementError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    user = await repo.create(
        tenant_id=DEFAULT_TENANT_ID,
        email=body.email,
        password_hash=password_hash,
        full_name=body.full_name,
        org_name=org_name,
        intended_use=body.intended_use,
        approval_status=UserApprovalStatus.APPROVED,
        org_role=invitation.role,  # Assign org role from invitation
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


async def _get_current_org_member(subject: Subject, session: AsyncSession) -> OrgMember | None:
    """Get the current user's org member info from the session."""
    if subject.subject_type == SubjectType.API_KEY:
        from app.repositories.api_keys import ApiKeyRepository
        keys = ApiKeyRepository(session)
        api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
        if api_key and api_key.user_id:
            return await OrgMemberRepository(session).get_by_subject(
                DEFAULT_TENANT_ID, str(api_key.user_id)
            )
    # For OAuth subjects, look up by user_subject
    return await OrgMemberRepository(session).get_by_subject(
        DEFAULT_TENANT_ID, subject.subject_id
    )


async def _team_view(repo: TeamRepository, team) -> TeamView:
    """Build a TeamView with the team's assigned server IDs populated."""
    view = TeamView.model_validate(team)
    view.server_ids = await repo.get_servers(team.id)
    return view


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
        role=body.role,
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

    # Enforce seat entitlement before approving a new member.
    try:
        await require_license(
            session,
            DEFAULT_TENANT_ID,
            users=await repo.count(DEFAULT_TENANT_ID) + 1,
            servers=0,
        )
    except LicenseEntitlementError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

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


# =========================================================================
# Teams API
# =========================================================================

@router.post("/teams", status_code=201, response_model=TeamView)
async def create_team(
    body: TeamCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TeamView:
    """Create a new team (admin only)."""
    # Check admin RBAC permission
    org_member_repo = OrgMemberRepository(session)
    # Get the current user's org member info
    from app.auth.subject import SubjectType
    if subject.subject_type == SubjectType.API_KEY:
        from app.repositories.api_keys import ApiKeyRepository
        keys = ApiKeyRepository(session)
        api_key = await keys.get_by_id(UUID(subject.subject_id), DEFAULT_TENANT_ID)
        if api_key and api_key.user_id:
            member = await OrgMemberRepository(session).get_by_subject(
                DEFAULT_TENANT_ID, str(api_key.user_id)
            )
    else:
        member = await OrgMemberRepository(session).get_by_subject(
            DEFAULT_TENANT_ID, subject.subject_id
        )
    
    if member:
        perm_decision = has_permission(member, AdminAction.CREATE_TEAM)
        if not perm_decision.allowed:
            raise HTTPException(status_code=403, detail=perm_decision.reason)
    
    repo = TeamRepository(session)
    team = await repo.create(DEFAULT_TENANT_ID, body)
    await session.commit()
    return await _team_view(repo, team)


@router.get("/teams", response_model=list[TeamView])
async def list_teams(
    session: Annotated[AsyncSession, Depends(get_session)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> list[TeamView]:
    """List all teams in the organization."""
    repo = TeamRepository(session)
    teams = await repo.list(DEFAULT_TENANT_ID)
    return [await _team_view(repo, t) for t in teams]


@router.get("/teams/{team_id}", response_model=TeamView)
async def get_team(
    team_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> TeamView:
    """Get a single team by ID."""
    repo = TeamRepository(session)
    team = await repo.get(DEFAULT_TENANT_ID, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return await _team_view(repo, team)


@router.patch("/teams/{team_id}", response_model=TeamView)
async def update_team(
    team_id: UUID,
    body: TeamUpdate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TeamView:
    """Update a team (admin only)."""
    repo = TeamRepository(session)
    team = await repo.get(DEFAULT_TENANT_ID, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    team = await repo.update(team, body)
    await session.commit()
    return await _team_view(repo, team)


@router.delete("/teams/{team_id}", status_code=204)
async def delete_team(
    team_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Delete a team (admin only)."""
    repo = TeamRepository(session)
    team = await repo.get(DEFAULT_TENANT_ID, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    await repo.delete(team)
    await session.commit()


@router.post("/teams/{team_id}/servers/{server_id}", status_code=204)
async def add_server_to_team(
    team_id: UUID,
    server_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Assign a server to a team (admin only)."""
    repo = TeamRepository(session)
    # Verify both exist
    team = await repo.get(DEFAULT_TENANT_ID, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    from app.repositories.servers import ServerRepository
    server_repo = ServerRepository(session)
    # Actually need to get by ID
    from sqlalchemy import select

    from app.models.orm import McpServer
    result = await session.scalars(select(McpServer).where(McpServer.id == server_id, McpServer.tenant_id == DEFAULT_TENANT_ID))
    server = result.first()
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Check if user has permission to assign servers to this team
    member = await _get_current_org_member(subject, session)
    if member:
        can_access = can_access_team_scope(member, team_id)
        if not can_access:
            raise HTTPException(status_code=403, detail="Cannot assign servers to this team")
    
    await repo.add_server(team_id, server_id)
    await session.commit()


@router.delete("/teams/{team_id}/servers/{server_id}", status_code=204)
async def remove_server_from_team(
    team_id: UUID,
    server_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Remove a server from a team (admin only)."""
    repo = TeamRepository(session)
    team = await repo.get(DEFAULT_TENANT_ID, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Check team scope access
    member = await _get_current_org_member(subject, session)
    if member:
        can_access = can_access_team_scope(member, team_id)
        if not can_access:
            raise HTTPException(status_code=403, detail="Cannot access this team")
    
    removed = await repo.remove_server(team_id, server_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Server not in team")
    await session.commit()


# =========================================================================
# Org Members API
# =========================================================================

@router.post("/members", status_code=201, response_model=OrgMemberView)
async def create_member(
    body: OrgMemberCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrgMemberView:
    """Invite/add a new org member (admin only)."""
    repo = OrgMemberRepository(session)
    
    # Check if user already exists in this org
    existing = await repo.get_by_subject(DEFAULT_TENANT_ID, body.user_subject)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Member already exists in this organization")
    
    # Enforce seat entitlement before adding a new member (org-member seats).
    try:
        await require_license(
            session,
            DEFAULT_TENANT_ID,
            users=await repo.count(DEFAULT_TENANT_ID) + 1,
            servers=0,
        )
    except LicenseEntitlementError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    
    # Get current user's org member info for permission check
    member = await _get_current_org_member(subject, session)
    if member:
        perm_decision = can_invite_role(member, body.admin_role)
        if not perm_decision:
            raise HTTPException(status_code=403, detail=f"Cannot invite role {body.admin_role}")
    
    member = await repo.create(DEFAULT_TENANT_ID, body)
    await session.commit()
    return OrgMemberView.model_validate(member)


@router.get("/members", response_model=list[OrgMemberView])
async def list_members(
    session: Annotated[AsyncSession, Depends(get_session)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> list[OrgMemberView]:
    """List all org members."""
    repo = OrgMemberRepository(session)
    members = await repo.list(DEFAULT_TENANT_ID)
    return [OrgMemberView.model_validate(m) for m in members]


@router.get("/members/{member_id}", response_model=OrgMemberView)
async def get_member(
    member_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> OrgMemberView:
    """Get a single org member by ID."""
    repo = OrgMemberRepository(session)
    member = await repo.get(DEFAULT_TENANT_ID, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return OrgMemberView.model_validate(member)


@router.patch("/members/{member_id}", response_model=OrgMemberView)
async def update_member(
    member_id: UUID,
    body: OrgMemberUpdate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrgMemberView:
    """Update an org member (admin only)."""
    repo = OrgMemberRepository(session)
    member = await repo.get(DEFAULT_TENANT_ID, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # TODO: Add permission checks - can current user manage this member?
    member = await repo.update(member, body)
    await session.commit()
    return OrgMemberView.model_validate(member)


@router.delete("/members/{member_id}", status_code=204)
async def delete_member(
    member_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Remove an org member (admin only)."""
    repo = OrgMemberRepository(session)
    member = await repo.get(DEFAULT_TENANT_ID, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    # TODO: Add permission checks - can current user remove this member?
    await repo.delete(member)
    await session.commit()


@router.get("/teams/{team_id}/members", response_model=list[OrgMemberView])
async def list_team_members(
    team_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> list[OrgMemberView]:
    """List all members of a team."""
    repo = OrgMemberRepository(session)
    members = await repo.get_by_team(DEFAULT_TENANT_ID, team_id)
    return [OrgMemberView.model_validate(m) for m in members]
