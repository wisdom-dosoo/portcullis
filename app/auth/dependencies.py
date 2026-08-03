"""FastAPI authentication dependency boundary."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_settings_dep
from app.auth.api_keys import verify_key
from app.auth.subject import Subject
from app.config import Settings


async def current_subject(
    authorization: Annotated[str, Header()] = "",
    session: Annotated[AsyncSession, Depends(get_session)] = None,  # type: ignore[assignment]
    settings: Annotated[Settings, Depends(get_settings_dep)] = None,  # type: ignore[assignment]
) -> Subject:
    """Parse Bearer token and return the authenticated Subject.

    Raises HTTPException(401) for any failure — missing header, malformed format,
    or invalid key. Never reveals whether the prefix exists.
    """
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    try:
        return await verify_key(raw=raw, pepper=settings.api_key_pepper, session=session)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


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
