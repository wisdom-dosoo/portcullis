"""API key management endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.api_keys import issue_key, revoke_key
from app.auth.dependencies import admin_subject
from app.auth.subject import Subject
from app.config import Settings
from app.models.schemas import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyView
from app.repositories.api_keys import ApiKeyRepository

router = APIRouter(prefix="/v1/api-keys", tags=["api-keys"])


@router.post("", status_code=201, response_model=ApiKeyCreateResponse)
async def create_api_key(
    body: ApiKeyCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    subject: Annotated[Subject, Depends(admin_subject)],
) -> ApiKeyCreateResponse:
    """Issue a new API key. Requires admin scope.

    The plaintext key is returned once and never stored.
    """
    issued = await issue_key(
        name=body.name,
        scopes=body.scopes,
        pepper=settings.api_key_pepper,
        session=session,
        tenant_id=subject.tenant_id,
    )
    # Fetch the persisted ORM record to build the view
    repo = ApiKeyRepository(session)
    api_key = await repo.get_by_prefix(issued.prefix)
    if api_key is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve created key")
    key_view = ApiKeyView.model_validate(api_key)
    return ApiKeyCreateResponse(key=key_view, plaintext=issued.plaintext)


@router.get("", response_model=list[ApiKeyView])
async def list_api_keys(
    session: Annotated[AsyncSession, Depends(get_session)],
    subject: Annotated[Subject, Depends(admin_subject)],
) -> list[ApiKeyView]:
    """Return all active API keys for the tenant. Requires admin scope (least privilege)."""
    repo = ApiKeyRepository(session)
    keys = await repo.list_active(subject.tenant_id)
    return [ApiKeyView.model_validate(k) for k in keys]


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    subject: Annotated[Subject, Depends(admin_subject)],
) -> Response:
    """Revoke an API key by ID. Requires admin scope."""
    try:
        await revoke_key(key_id=key_id, tenant_id=subject.tenant_id, session=session)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Key {key_id} not found") from exc
    return Response(status_code=204)
