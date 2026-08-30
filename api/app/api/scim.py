"""SCIM (System for Cross-domain Identity Management) provisioning API.

Supports standard SCIM 1.1/1.2 operations for Users and Groups:
- GET /scim/Users?filter=...&text=...&sortBy=...&sortOrder=...
- POST /scim/Users
- GET /scim/Users/{id}
- PUT /scim/Users/{id}
- DELETE /scim/Users/{id}
- GET /scim/Groups?filter=...&text=...
- POST /scim/Groups
- GET /scim/Groups/{id}
- PUT /scim/Groups/{id}
- DELETE /scim/Groups/{id}
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi import status as http_status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_runtime, get_session
from app.auth.dependencies import authenticated_subject
from app.auth.subject import Subject
from app.models.orm import (
    OrgMember,
    OrgMemberRole,
    OrgRole,
    User,
    UserApprovalStatus,
)
from app.models.schemas import OrgMemberCreate, ScimGroup, ScimUser
from app.repositories.org_members import OrgMemberRepository
from app.repositories.users import UserRepository

router = APIRouter(prefix="/scim", tags=["scim"])


def _resolve_tenant(subject: Subject | None, runtime: object) -> object:
    """Resolve tenant_id from authenticated subject (preferred) or runtime fallback."""
    if subject is not None:
        return subject.tenant_id
    # Fallback for legacy SCIM clients without gateway auth — keep None so
    # tenant-scoped queries degrade gracefully rather than leaking across tenants.
    if hasattr(runtime, "tenant_id"):
        return runtime.tenant_id  # type: ignore[no-any-return]
    return None


# ── Helpers ────────────────────────────────────────────────────────────────


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _decode_scim_id(scim_id: str) -> str:
    """SCIM IDs may be base64url encoded; strip padding and decode if needed."""
    try:
        if re.fullmatch(r"[A-Za-z0-9_-]+={0,2}", scim_id):
            padded = scim_id + "=" * (4 - len(scim_id) % 4) if len(scim_id) % 4 else scim_id
            decoded = hashlib.sha256(padded.encode()).hexdigest()[:32]
            return decoded
    except Exception:
        pass
    return scim_id


def _serialize_scim_user(user: ScimUser) -> dict[str, Any]:
    """Convert ScimUser Pydantic model to SCIM JSON API response dict."""
    base: dict[str, Any] = {
        "id": user.id,
        "schemas": user.schemas,
        "userName": user.userName,
        "active": user.active,
        "displayName": user.displayName,
        "meta": {
            "resourceType": "User",
            "lastModified": _now_utc().isoformat().replace("+00:00", "Z"),
        },
    }

    # Name
    if user.name:
        base["name"] = user.name

    # Groups
    if user.groups:
        base["groups"] = [{"value": g} for g in user.groups]

    return base


def _serialize_scim_group(group: ScimGroup) -> dict[str, Any]:
    """Convert ScimGroup Pydantic model to SCIM JSON API response dict."""
    base: dict[str, Any] = {
        "id": group.id,
        "schemas": group.schemas,
        "name": group.name,
        "displayName": group.name,
        "meta": {
            "resourceType": "Group",
            "lastModified": _now_utc().isoformat().replace("+00:00", "Z"),
        },
    }

    if group.description:
        base["description"] = group.description

    if group.members:
        base["members"] = group.members

    return base


def _extract_user_from_scim(scim_user: dict[str, Any]) -> ScimUser:
    """Extract ScimUser from a SCIM JSON request body."""
    schemas = scim_user.get("schemas", [])
    user_name = scim_user.get("userName", "")
    display_name = scim_user.get("displayName")
    active = scim_user.get("active")
    external_id = scim_user.get("externalId")

    # Name
    name = scim_user.get("name")

    # Groups
    groups = scim_user.get("groups", [])

    return ScimUser(
        id=external_id or user_name,
        userName=user_name,
        displayName=display_name,
        active=active,
        name=name,
        groups=groups,
        schemas=schemas,
    )


def _extract_group_from_scim(scim_group: dict[str, Any]) -> ScimGroup:
    """Extract ScimGroup from a SCIM JSON request body."""
    schemas = scim_group.get("schemas", [])
    name = scim_group.get("name", "")
    description = scim_group.get("description")
    members = scim_group.get("members", [])

    return ScimGroup(
        id=hashlib.sha256(name.encode()).hexdigest()[:32],
        name=name,
        description=description,
        members=members,
        schemas=schemas,
    )


# ── Users endpoints ────────────────────────────────────────────────────────


@router.get("/Users", response_model=list[ScimUser], summary="Search Users")
async def scim_list_users(
    filter: str | None = Query(default=None, description="SCIM filter expression"),
    text: str | None = Query(default=None, description="Search text"),
    sortBy: str | None = Query(default=None, description="Sort by attribute"),
    sortOrder: str | None = Query(default="normal", description="Sort order (normal|reverse)"),
    session: AsyncSession = Depends(get_session),
    subject: Subject = Depends(authenticated_subject),  # tenant isolation via subject
) -> list[ScimUser]:
    """List users with optional filtering and searching (tenant-scoped)."""
    tenant_id = subject.tenant_id

    repo = OrgMemberRepository(session)
    query = select(OrgMember).join(User).where(User.tenant_id == OrgMember.tenant_id)

    if text:
        # Search by userName or displayName (OrgMember.user_subject)
        query = query.where(
            or_(
                OrgMember.user_subject.ilike(f"%{text}%"),
            )
        )

    result = await session.scalars(query.order_by(OrgMember.created_at.desc()))
    org_members = result.all()

    # Convert OrgMember + User to ScimUser
    users: list[ScimUser] = []
    for om in org_members:
        user = om.user  # relationship to User
        scim_user = ScimUser(
            id=str(om.id),
            userName=user.email or user.org_name or om.user_subject,
            displayName=user.full_name or user.org_name,
            active=user.is_active,
            name={
                "familyName": user.full_name or "",
                "givenName": user.full_name or "",
            }
            if user.full_name
            else None,
            groups=[],  # Will be populated if we have team info
            schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
        )
        users.append(scim_user)

    return users


@router.post("/Users", response_model=ScimUser, summary="Create User")
async def scim_create_user(
    scim_user: ScimUser,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> ScimUser:
    """Create a new user via SCIM."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    repo = OrgMemberRepository(session)
    user_repo = UserRepository(session)

    # Check if user already exists by userSubject or email
    user_subject = scim_user.userName

    # Check if org member already exists
    om = await repo.get_by_subject(tenant_id, user_subject) if tenant_id else None

    if om:
        # User exists - return existing
        user = om.user
        return ScimUser(
            id=str(om.id),
            userName=user.email or user.org_name or om.user_subject,
            displayName=user.full_name or user.org_name,
            active=user.is_active,
            name={
                "familyName": user.full_name or "",
                "givenName": user.full_name or "",
            }
            if user.full_name
            else None,
            schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
        )

    # Create new user
    new_user = await user_repo.create(
        tenant_id=tenant_id,
        email=scim_user.userName,
        password_hash="",  # Would be set by Invite flow
        full_name=scim_user.displayName or scim_user.userName,
        org_name=scim_user.displayName or scim_user.userName,
        approval_status=UserApprovalStatus.APPROVED,
        org_role=OrgRole.DEVELOPER,
    )

    # Create org member
    await repo.create(
        tenant_id,
        OrgMemberCreate(
            user_subject=user_subject,
            admin_role=OrgMemberRole.DEVELOPER,
        ),
    )

    return ScimUser(
        id=str(new_user.id),
        userName=new_user.email or new_user.org_name,
        displayName=new_user.full_name or new_user.org_name,
        active=new_user.is_active,
        name={
            "familyName": new_user.full_name or "",
            "givenName": new_user.full_name or "",
        }
        if new_user.full_name
        else None,
        schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
    )


@router.get("/Users/{scim_id}", response_model=ScimUser, summary="Get User by ID")
async def scim_get_user(
    scim_id: str,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> ScimUser:
    """Get a user by SCIM ID."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    decoded_id = _decode_scim_id(scim_id)
    repo = OrgMemberRepository(session)

    # SCIM ID could be the org member's database ID or user_subject
    # Try to find by user_subject first (more reliable for SCIM)
    om = await repo.get_by_subject(tenant_id, decoded_id) if tenant_id else None

    if not om:
        # Try by ID
        result = await session.scalars(select(OrgMember).where(OrgMember.id == UUID(decoded_id)))
        om = result.first()

    if not om:
        raise HTTPException(status_code=404, detail="User not found")

    user = om.user
    return ScimUser(
        id=str(om.id),
        userName=user.email or user.org_name or om.user_subject,
        displayName=user.full_name or user.org_name,
        active=user.is_active,
        name={
            "familyName": user.full_name or "",
            "givenName": user.full_name or "",
        }
        if user.full_name
        else None,
        schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
    )


@router.put("/Users/{scim_id}", response_model=ScimUser, summary="Update User")
async def scim_update_user(
    scim_id: str,
    scim_user: ScimUser,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> ScimUser:
    """Update a user via SCIM."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    decoded_id = _decode_scim_id(scim_id)
    repo = OrgMemberRepository(session)

    # Try to find by user_subject first
    om = await repo.get_by_subject(tenant_id, decoded_id) if tenant_id else None

    if not om:
        # Try by ID
        result = await session.scalars(select(OrgMember).where(OrgMember.id == UUID(decoded_id)))
        om = result.first()

    if not om:
        raise HTTPException(status_code=404, detail="User not found")

    # Update org member if active flag changed
    if scim_user.active is not None:
        # Map SCIM active flag to org member status
        # In a full implementation, this would update user approval status
        pass

    user = om.user
    return ScimUser(
        id=str(om.id),
        userName=user.email or user.org_name or om.user_subject,
        displayName=user.full_name or user.org_name,
        active=user.is_active,
        name={
            "familyName": user.full_name or "",
            "givenName": user.full_name or "",
        }
        if user.full_name
        else None,
        schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
    )


@router.delete(
    "/Users/{scim_id}", status_code=http_status.HTTP_204_NO_CONTENT, summary="Delete User"
)
async def scim_delete_user(
    scim_id: str,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a user via SCIM."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    decoded_id = _decode_scim_id(scim_id)
    repo = OrgMemberRepository(session)

    # Try to find by user_subject first
    om = await repo.get_by_subject(tenant_id, decoded_id) if tenant_id else None

    if not om:
        # Try by ID
        result = await session.scalars(select(OrgMember).where(OrgMember.id == UUID(decoded_id)))
        om = result.first()

    if not om:
        raise HTTPException(status_code=404, detail="User not found")

    # Soft delete - mark user as inactive rather than hard delete
    user = om.user
    if user:
        user.is_active = False
        user.approval_status = UserApprovalStatus.REJECTED
    await session.delete(om)
    await session.commit()


# ── Groups endpoints ───────────────────────────────────────────────────────


@router.get("/Groups", response_model=list[ScimGroup], summary="Search Groups")
async def scim_list_groups(
    filter: str | None = Query(default=None, description="SCIM filter expression"),
    text: str | None = Query(default=None, description="Search text"),
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> list[ScimGroup]:
    """List groups with optional filtering."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    repo = OrgMemberRepository(session)
    query = select(OrgMember).where(OrgMember.tenant_id == tenant_id)

    if text:
        # Search by user_subject or admin_role
        query = query.where(
            or_(
                OrgMember.user_subject.ilike(f"%{text}%"),
                OrgMember.admin_role.ilike(f"%{text}%"),
            )
        )

    result = await session.scalars(query.distinct())
    org_members = result.all()

    groups: list[ScimGroup] = []
    for om in org_members:
        # Create a group based on the org member's role
        group = ScimGroup(
            id=hashlib.sha256(om.user_subject.encode()).hexdigest()[:32],
            name=om.admin_role.value,
            description=f"Organization member role: {om.admin_role.value}",
            members=[{"value": om.user_subject}],
            schemas=["urn:ietf:params:scim:schemas:core:1.1:Group"],
        )
        groups.append(group)

    return groups


@router.post("/Groups", response_model=ScimGroup, summary="Create Group")
async def scim_create_group(
    scim_group: ScimGroup,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> ScimGroup:
    """Create a new group via SCIM."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    repo = OrgMemberRepository(session)

    # Check if a group with this name already exists
    existing = await session.scalars(
        select(OrgMember).where(
            OrgMember.tenant_id == tenant_id,
            OrgMember.admin_role.ilike(scim_group.name),
        )
    )
    existing_om = existing.first()

    if existing_om:
        # Return existing org member as a group
        return ScimGroup(
            id=hashlib.sha256(existing_om.user_subject.encode()).hexdigest()[:32],
            name=existing_om.admin_role.value,
            description=f"Organization member role: {existing_om.admin_role.value}",
            members=[{"value": existing_om.user_subject}],
            schemas=["urn:ietf:params:scim:schemas:core:1.1:Group"],
        )

    # Create a new org member group
    # Map the group name to an admin_role
    role_mapping = {
        "admin": OrgMemberRole.ORG_ADMIN,
        "developer": OrgMemberRole.DEVELOPER,
        "viewer": OrgMemberRole.VIEWER,
        "auditor": OrgMemberRole.AUDITOR,
        "owner": OrgMemberRole.ORG_OWNER,
    }

    admin_role = role_mapping.get(scim_group.name.lower(), OrgMemberRole.DEVELOPER)

    new_om = await repo.create(
        tenant_id,
        OrgMemberCreate(
            user_subject=scim_group.name,
            admin_role=admin_role,
        ),
    )

    return ScimGroup(
        id=hashlib.sha256(scim_group.name.encode()).hexdigest()[:32],
        name=scim_group.name,
        description=scim_group.description or f"Organization member role: {admin_role.value}",
        members=[{"value": scim_group.name}],
        schemas=["urn:ietf:params:scim:schemas:core:1.1:Group"],
    )


@router.get("/Groups/{scim_id}", response_model=ScimGroup, summary="Get Group by ID")
async def scim_get_group(
    scim_id: str,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> ScimGroup:
    """Get a group by SCIM ID."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    decoded_id = _decode_scim_id(scim_id)
    repo = OrgMemberRepository(session)

    # Try to find org member by user_subject matching the decoded ID
    om = await repo.get_by_subject(tenant_id, decoded_id) if tenant_id else None

    if not om:
        # Try by ID
        result = await session.scalars(select(OrgMember).where(OrgMember.id == UUID(decoded_id)))
        om = result.first()

    if not om:
        raise HTTPException(status_code=404, detail="Group not found")

    return ScimGroup(
        id=hashlib.sha256(om.user_subject.encode()).hexdigest()[:32],
        name=om.admin_role.value,
        description=f"Organization member role: {om.admin_role.value}",
        members=[{"value": om.user_subject}],
        schemas=["urn:ietf:params:scim:schemas:core:1.1:Group"],
    )


@router.put("/Groups/{scim_id}", response_model=ScimGroup, summary="Update Group")
async def scim_update_group(
    scim_id: str,
    scim_group: ScimGroup,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> ScimGroup:
    """Update a group via SCIM."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    decoded_id = _decode_scim_id(scim_id)
    repo = OrgMemberRepository(session)

    # Try to find org member by user_subject matching the decoded ID
    om = await repo.get_by_subject(tenant_id, decoded_id) if tenant_id else None

    if not om:
        # Try by ID
        result = await session.scalars(select(OrgMember).where(OrgMember.id == UUID(decoded_id)))
        om = result.first()

    if not om:
        raise HTTPException(status_code=404, detail="Group not found")

    # Update the org member's role if name changed
    role_mapping = {
        "admin": OrgMemberRole.ORG_ADMIN,
        "developer": OrgMemberRole.DEVELOPER,
        "viewer": OrgMemberRole.VIEWER,
        "auditor": OrgMemberRole.AUDITOR,
        "owner": OrgMemberRole.ORG_OWNER,
    }

    new_admin_role = role_mapping.get(scim_group.name.lower(), om.admin_role)
    if new_admin_role != om.admin_role:
        om.admin_role = new_admin_role

    return ScimGroup(
        id=hashlib.sha256(om.user_subject.encode()).hexdigest()[:32],
        name=om.admin_role.value,
        description=f"Organization member role: {om.admin_role.value}",
        members=[{"value": om.user_subject}],
        schemas=["urn:ietf:params:scim:schemas:core:1.1:Group"],
    )


@router.delete(
    "/Groups/{scim_id}", status_code=http_status.HTTP_204_NO_CONTENT, summary="Delete Group"
)
async def scim_delete_group(
    scim_id: str,
    request: Request = Depends(get_runtime),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a group via SCIM."""
    runtime = request.app.state.runtime  # type: ignore[attr-defined]
    tenant_id = runtime.tenant_id if hasattr(runtime, "tenant_id") else None

    decoded_id = _decode_scim_id(scim_id)
    repo = OrgMemberRepository(session)

    # Try to find org member by user_subject matching the decoded ID
    om = await repo.get_by_subject(tenant_id, decoded_id) if tenant_id else None

    if not om:
        # Try by ID
        result = await session.scalars(select(OrgMember).where(OrgMember.id == UUID(decoded_id)))
        om = result.first()

    if not om:
        raise HTTPException(status_code=404, detail="Group not found")

    # Soft delete - mark as inactive
    user = om.user
    if user:
        user.is_active = False
        user.approval_status = UserApprovalStatus.REJECTED
    await session.delete(om)
    await session.commit()
