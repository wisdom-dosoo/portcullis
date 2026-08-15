"""Upstream MCP server management endpoint boundary."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.config import Settings
from app.gateway.registry import DEFAULT_TENANT_ID, RegistryService, SlugConflictError
from app.models.schemas import ServerCreate, ServerUpdate, ServerView
from app.repositories.servers import ServerRepository

router = APIRouter(prefix="/v1/servers", tags=["servers"])


@router.post("", status_code=201, response_model=ServerView)
async def create_server(
    body: ServerCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _subject: Annotated[Subject, Depends(admin_subject)],
) -> ServerView:
    """Register a new upstream MCP server. Requires admin scope."""
    svc = RegistryService(session=session, settings=settings)
    try:
        return await svc.create(body)
    except SlugConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=list[ServerView])
async def list_servers(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> list[ServerView]:
    """Return all registered MCP servers."""
    svc = RegistryService(session=session, settings=settings)
    return await svc.list()


@router.get("/{slug}", response_model=ServerView)
async def get_server(
    slug: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> ServerView:
    """Return a single MCP server by slug."""
    svc = RegistryService(session=session, settings=settings)
    try:
        return await svc.get(slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{slug}", response_model=ServerView)
async def update_server(
    slug: str,
    body: ServerUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _subject: Annotated[Subject, Depends(admin_subject)],
) -> ServerView:
    """Update an existing MCP server registration. Requires admin scope."""
    svc = RegistryService(session=session, settings=settings)
    try:
        return await svc.update(slug, body)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SlugConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{slug}", status_code=204)
async def delete_server(
    slug: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _subject: Annotated[Subject, Depends(admin_subject)],
) -> Response:
    """Delete an MCP server registration. Requires admin scope."""
    svc = RegistryService(session=session, settings=settings)
    try:
        await svc.delete(slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post("/{slug}/health", response_model=None)
async def trigger_health_probe(
    slug: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    _subject: Annotated[Subject, Depends(authenticated_subject)],
) -> dict[str, str]:
    """Trigger an immediate health probe for the specified server."""
    # Fetch the ORM object to pass to the monitor
    repo = ServerRepository(session)
    server = await repo.get_by_slug(DEFAULT_TENANT_ID, slug)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{slug}' not found")

    monitor = request.app.state.monitor
    await monitor.probe(server)

    # Return status from the ORM object after probe
    return {"status": server.status}
