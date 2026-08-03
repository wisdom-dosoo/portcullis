"""Role, binding, and permission endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.models.schemas import (
    RoleBindingCreate,
    RoleBindingView,
    RoleCreate,
    RoleView,
    ToolPermissionCreate,
    ToolPermissionView,
)
from app.repositories.rbac import RbacRepository

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")

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
) -> list[RoleView]:
    """List all roles for the current tenant."""
    repo = RbacRepository(session)
    roles = await repo.list_roles(tenant_id=subject.tenant_id)
    return [RoleView.model_validate(r) for r in roles]


@router.post("/{role_id}/bindings", status_code=201, response_model=RoleBindingView)
async def create_binding(
    role_id: UUID,
    body: RoleBindingCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleBindingView:
    """Bind an API key subject to a role (admin only)."""
    repo = RbacRepository(session)
    role = await repo.get_role(tenant_id=subject.tenant_id, role_id=role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    binding = await repo.create_binding(role_id=role_id, subject_id=body.subject_id)
    await session.commit()
    return RoleBindingView.model_validate(binding)


@router.delete("/{role_id}/bindings/{binding_id}", status_code=204)
async def delete_binding(
    role_id: UUID,
    binding_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Remove a role binding (admin only)."""
    repo = RbacRepository(session)
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
    """Remove a tool permission rule from a role (admin only)."""
    repo = RbacRepository(session)
    deleted = await repo.delete_permission(permission_id=permission_id, role_id=role_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Permission not found")
    await session.commit()
    return Response(status_code=204)
