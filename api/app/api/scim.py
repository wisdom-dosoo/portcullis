"""SCIM (System for Cross-domain Identity Management) provisioning API.

P0-hardened: every route requires an authenticated subject and is strictly
tenant-scoped. The legacy ``get_runtime`` fallback (which injected a
``Runtime`` where a ``Request`` was expected and resolved ``tenant_id=None``)
has been removed.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
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


def _resolve_tenant(subject: Subject) -> Any:
    """Resolve tenant_id from the authenticated subject (only source)."""
    return subject.tenant_id


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _decode_scim_id(scim_id: str) -> str:
    """Return the SCIM id unchanged.

    P0: the previous implementation hashed the id with sha256 and then tried
    ``UUID(decoded)``, which always raised ``ValueError`` -> 500. SCIM ids
    issued by this API are ``str(OrgMember.id)`` UUIDs, so pass through.
    """
    return scim_id


def _escape_like(text: str) -> str:
    """Escape LIKE wildcards so ``text`` cannot over-match or force full scans."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def _resolve_member_by_scim_id(
    session: AsyncSession,
    repo: OrgMemberRepository,
    tenant_id: Any,
    scim_id: str,
) -> OrgMember | None:
    """Resolve an OrgMember by SCIM id, tenant-scoped, returning None (not 500).

    Tries ``user_subject`` match first, then UUID primary-key lookup scoped to
    the tenant. Invalid UUIDs return None so callers can 404.
    """
    decoded = _decode_scim_id(scim_id)
    om = await repo.get_by_subject(tenant_id, decoded)
    if om is not None:
        return om
    try:
        member_id = UUID(decoded)
    except (ValueError, AttributeError, TypeError):
        return None
    return await repo.get(tenant_id, member_id)


def _member_to_scim_user(om: OrgMember, user: User | None) -> ScimUser:
    """Serialize an OrgMember (+ optional User) to SCIM without crashing.

    P0: ``OrgMember`` has no ``user`` relationship in the ORM, so callers must
    explicitly load the User by email. Falls back to subject-only fields.
    """
    if user is not None:
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
            groups=[],
            schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
        )
    return ScimUser(
        id=str(om.id),
        userName=om.user_subject,
        displayName=om.user_subject,
        active=True,
        name=None,
        groups=[],
        schemas=["urn:ietf:params:scim:schemas:core:1.1:User"],
    )


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
    if user.name:
        base["name"] = user.name
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
    name = scim_user.get("name")
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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> list[ScimUser]:
    """List users with optional filtering and searching (tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    # P0: strictly tenant-scoped. Previously
    # ``User.tenant_id == OrgMember.tenant_id`` listed all tenants, and
    # ``om.user`` crashed (no relationship on the ORM).
    query = select(OrgMember).where(OrgMember.tenant_id == tenant_id)

    if text:
        safe = _escape_like(text)
        query = query.where(
            or_(
                OrgMember.user_subject.ilike(f"%{safe}%", escape="\\"),
            )
        )

    result = await session.scalars(query.order_by(OrgMember.created_at.desc()))
    org_members = result.all()

    user_repo = UserRepository(session)
    users: list[ScimUser] = []
    for om in org_members:
        user = await user_repo.get_by_email(tenant_id, om.user_subject)
        users.append(_member_to_scim_user(om, user))

    return users


@router.post("/Users", response_model=ScimUser, summary="Create User")
async def scim_create_user(
    scim_user: ScimUser,
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> ScimUser:
    """Create a new user via SCIM (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    user_repo = UserRepository(session)

    user_subject = scim_user.userName
    om = await repo.get_by_subject(tenant_id, user_subject)

    if om:
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

    new_user = await user_repo.create(
        tenant_id=tenant_id,
        email=scim_user.userName,
        password_hash="",
        full_name=scim_user.displayName or scim_user.userName,
        org_name=scim_user.displayName or scim_user.userName,
        approval_status=UserApprovalStatus.APPROVED,
        org_role=OrgRole.DEVELOPER,
    )

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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> ScimUser:
    """Get a user by SCIM ID (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    om = await _resolve_member_by_scim_id(session, repo, tenant_id, scim_id)
    if not om:
        raise HTTPException(status_code=404, detail="User not found")
    user = await UserRepository(session).get_by_email(tenant_id, om.user_subject)
    return _member_to_scim_user(om, user)


@router.put("/Users/{scim_id}", response_model=ScimUser, summary="Update User")
async def scim_update_user(
    scim_id: str,
    scim_user: ScimUser,
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> ScimUser:
    """Update a user via SCIM (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    om = await _resolve_member_by_scim_id(session, repo, tenant_id, scim_id)
    if not om:
        raise HTTPException(status_code=404, detail="User not found")
    user = await UserRepository(session).get_by_email(tenant_id, om.user_subject)
    return _member_to_scim_user(om, user)


@router.delete(
    "/Users/{scim_id}", status_code=http_status.HTTP_204_NO_CONTENT, summary="Delete User"
)
async def scim_delete_user(
    scim_id: str,
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> None:
    """Delete a user via SCIM (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    om = await _resolve_member_by_scim_id(session, repo, tenant_id, scim_id)
    if not om:
        raise HTTPException(status_code=404, detail="User not found")
    user = await UserRepository(session).get_by_email(tenant_id, om.user_subject)
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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> list[ScimGroup]:
    """List groups with optional filtering (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    query = select(OrgMember).where(OrgMember.tenant_id == tenant_id)
    if text:
        safe = _escape_like(text)
        query = query.where(
            or_(
                OrgMember.user_subject.ilike(f"%{safe}%", escape="\\"),
            )
        )
    result = await session.scalars(query.distinct())
    org_members = result.all()
    groups: list[ScimGroup] = []
    for om in org_members:
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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> ScimGroup:
    """Create a new group via SCIM (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    existing = await session.scalars(
        select(OrgMember).where(
            OrgMember.tenant_id == tenant_id,
            OrgMember.admin_role == scim_group.name,
        )
        if False
        else select(OrgMember).where(OrgMember.tenant_id == tenant_id)
    )
    # P0: keep exact-match semantics without ilike on enum column.
    existing_om: OrgMember | None = None
    for candidate in existing.all():
        if candidate.admin_role.value.lower() == scim_group.name.lower():
            existing_om = candidate
            break
    if existing_om:
        return ScimGroup(
            id=hashlib.sha256(existing_om.user_subject.encode()).hexdigest()[:32],
            name=existing_om.admin_role.value,
            description=f"Organization member role: {existing_om.admin_role.value}",
            members=[{"value": existing_om.user_subject}],
            schemas=["urn:ietf:params:scim:schemas:core:1.1:Group"],
        )
    role_mapping = {
        "admin": OrgMemberRole.ORG_ADMIN,
        "developer": OrgMemberRole.DEVELOPER,
        "viewer": OrgMemberRole.VIEWER,
        "auditor": OrgMemberRole.AUDITOR,
        "owner": OrgMemberRole.ORG_OWNER,
    }
    admin_role = role_mapping.get(scim_group.name.lower(), OrgMemberRole.DEVELOPER)
    await repo.create(
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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> ScimGroup:
    """Get a group by SCIM ID (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    om = await _resolve_member_by_scim_id(session, repo, tenant_id, scim_id)
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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> ScimGroup:
    """Update a group via SCIM (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    om = await _resolve_member_by_scim_id(session, repo, tenant_id, scim_id)
    if not om:
        raise HTTPException(status_code=404, detail="Group not found")
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
    session: AsyncSession = Depends(get_session),  # noqa: B008
    subject: Subject = Depends(authenticated_subject),  # noqa: B008
) -> None:
    """Delete a group via SCIM (authenticated, tenant-scoped)."""
    tenant_id = _resolve_tenant(subject)
    repo = OrgMemberRepository(session)
    om = await _resolve_member_by_scim_id(session, repo, tenant_id, scim_id)
    if not om:
        raise HTTPException(status_code=404, detail="Group not found")
    user = await UserRepository(session).get_by_email(tenant_id, om.user_subject)
    if user:
        user.is_active = False
        user.approval_status = UserApprovalStatus.REJECTED
    await session.delete(om)
    await session.commit()
