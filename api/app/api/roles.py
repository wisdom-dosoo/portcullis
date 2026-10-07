"""Role, binding, and permission endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.models.orm import SubjectType
from app.models.schemas import (
    RoleBindingCreate,
    RoleBindingView,
    RoleCreate,
    RoleView,
    ToolPermissionCreate,
    ToolPermissionView,
)
from app.repositories.api_keys import ApiKeyRepository
from app.repositories.rbac import RbacRepository
from app.repositories.users import UserRepository

router = APIRouter(prefix="/v1/roles", tags=["roles"])


@router.post("", status_code=201, response_model=RoleView)
async def create_role(
    body: RoleCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleView:
    """Create a new role (admin only)."""
    repo = RbacRepository(session)
    role = await repo.create_role(tenant_id=subject.tenant_id, name=body.name)
    await session.commit()
    return RoleView.model_validate(role)


@router.get("", status_code=200, response_model=list[RoleView])
async def list_roles(
    subject: Annotated[Subject, Depends(authenticated_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    response: Response,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 100 - 100,
) -> list[RoleView]:
    """List roles for the current tenant (P1: paginated).

    The platform ``super_admin`` role is hidden from non-platform callers —
    org admins and members never see it. Platform admins (bootstrap
    ``admin``-scope keys or ``is_platform_admin`` users) see the full set.
    """
    repo = RbacRepository(session)
    roles = await repo.list_roles(tenant_id=subject.tenant_id)
    if not await _is_platform_caller(subject, session):
        roles = [r for r in roles if r.name != "super_admin"]
    response.headers["X-Total-Count"] = str(len(roles))
    return [RoleView.model_validate(r) for r in roles[offset : offset + limit]]


async def _is_platform_caller(subject: Subject, session: AsyncSession) -> bool:
    """Return True when the caller is a platform operator.

    Mirrors ``platform_admin_subject`` without raising: bootstrap keys
    carrying the ``admin`` scope, or API-key subjects whose backing user
    has ``is_platform_admin`` set. Anything else (including OAuth
    subjects) is not a platform caller.
    """
    if subject.has_scope("admin"):
        return True
    if subject.subject_type is not SubjectType.API_KEY:
        return False
    try:
        api_key = await ApiKeyRepository(session).get_by_id(
            UUID(subject.subject_id), subject.tenant_id
        )
    except (ValueError, AttributeError):
        return False
    if api_key is None or api_key.user_id is None:
        return False
    user = await UserRepository(session).get_by_id(subject.tenant_id, api_key.user_id)
    return bool(user is not None and user.is_active and user.is_platform_admin)


@router.post("/{role_id}/bindings", status_code=201, response_model=RoleBindingView)
async def create_binding(
    role_id: UUID,
    body: RoleBindingCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleBindingView:
    """Bind a subject to a role (admin only).

    API-key bindings are validated against a key that belongs to the same
    tenant, so a cross-tenant or non-existent key cannot be bound.
    """
    repo = RbacRepository(session)
    role = await repo.get_role(tenant_id=subject.tenant_id, role_id=role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    if body.subject_type is SubjectType.API_KEY:
        try:
            key_id = UUID(body.subject_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="subject_id must be a valid API key UUID"
            ) from exc
        api_keys = ApiKeyRepository(session)
        api_key = await api_keys.get_by_id(key_id, subject.tenant_id)
        if api_key is None:
            raise HTTPException(status_code=422, detail="API key not found in tenant")

    binding = await repo.create_binding(
        role_id=role_id,
        subject_id=body.subject_id,
        subject_type=body.subject_type,
    )
    await session.commit()
    return RoleBindingView.model_validate(binding)


@router.delete("/{role_id}/bindings/{binding_id}", status_code=204)
async def delete_binding(
    role_id: UUID,
    binding_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Remove a role binding (admin only, P1: tenant-verified)."""
    repo = RbacRepository(session)
    # P1: verify the role belongs to the caller's tenant before deleting.
    role = await repo.get_role(tenant_id=subject.tenant_id, role_id=role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    deleted = await repo.delete_binding(binding_id=binding_id, role_id=role_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Binding not found")
    await session.commit()
    return Response(status_code=204)


@router.post("/{role_id}/permissions", status_code=201, response_model=ToolPermissionView)
async def create_permission(
    role_id: UUID,
    body: ToolPermissionCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ToolPermissionView:
    """Attach a tool permission rule to a role (admin only)."""
    repo = RbacRepository(session)
    role = await repo.get_role(tenant_id=subject.tenant_id, role_id=role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    permission = await repo.create_permission(
        role_id=role_id,
        server_pattern=body.server_pattern,
        tool_pattern=body.tool_pattern,
        effect=body.effect,
        priority=body.priority,
    )
    await session.commit()
    return ToolPermissionView.model_validate(permission)


@router.delete("/{role_id}/permissions/{permission_id}", status_code=204)
async def delete_permission(
    role_id: UUID,
    permission_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Remove a tool permission rule (admin only, P1: tenant-verified)."""
    repo = RbacRepository(session)
    role = await repo.get_role(tenant_id=subject.tenant_id, role_id=role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    deleted = await repo.delete_permission(permission_id=permission_id, role_id=role_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Permission not found")
    await session.commit()
    return Response(status_code=204)
