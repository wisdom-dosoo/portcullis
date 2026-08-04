"""FastAPI authentication dependency boundary."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.authenticate import authenticate
from app.auth.subject import Subject
from app.config import Settings


async def current_subject(
    authorization: Annotated[str, Header()] = "",
    session: Annotated[AsyncSession, Depends(get_session)] = None,  # type: ignore[assignment]
    settings: Annotated[Settings, Depends(get_settings_dep)] = None,  # type: ignore[assignment]
) -> Subject:
    """Parse Bearer token and return the authenticated Subject.

    Dispatches between API key auth (``pk_`` prefix) and JWT bearer auth.
    Raises HTTPException(401) for any failure — missing header, malformed format,
    or invalid credentials. Never reveals internal details.
    """
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")
    try:
        return await authenticate(raw, settings, session)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


async def authenticated_subject(
    subject: Annotated[Subject, Depends(current_subject)],
) -> Subject:
    """Pass through any valid authenticated subject."""
    return subject


async def admin_subject(
    subject: Annotated[Subject, Depends(current_subject)],
) -> Subject:
    """Return subject only if they hold the 'admin' scope.

    Raises HTTPException(403) otherwise.
    """
    if not subject.has_scope("admin"):
        raise HTTPException(status_code=403, detail="Admin scope required")
    return subject
