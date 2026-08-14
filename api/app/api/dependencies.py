"""Typed FastAPI dependency providers for gateway routes."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.runtime import Runtime


async def get_runtime(request: Request) -> Runtime:
    """Return the process-wide Runtime from application state."""
    return request.app.state.runtime  # type: ignore[no-any-return]


async def get_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session from the Runtime session factory."""
    runtime: Runtime = request.app.state.runtime
    async with runtime.session_factory() as session:
        yield session


async def get_settings_dep() -> Settings:
    """Return the validated process-wide settings."""
    return get_settings()
