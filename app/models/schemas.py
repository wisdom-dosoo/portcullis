"""Pydantic request and response schema boundary."""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.orm import ServerAuthMode, ServerStatus, ServerTransport

_SLUG_ALLOWED = re.compile(r"^[a-z0-9-]+$")


def _normalize_slug(value: str) -> str:
    """Normalize a slug to lowercase hyphen-separated form."""
    # Lowercase
    slug = value.lower()
    # Replace spaces with hyphens
    slug = slug.replace(" ", "-")
    # Remove any character that is not [a-z0-9-]
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    # Strip leading/trailing hyphens
    slug = slug.strip("-")
    return slug


class ServerCreate(BaseModel):
    """Schema for creating a new MCP server registration."""

    name: str
    slug: str
    upstream_url: str
    transport: ServerTransport = ServerTransport.STREAMABLE_HTTP
    auth_mode: ServerAuthMode = ServerAuthMode.NONE
    service_token_env_var: str | None = None
    health_check_path: str = "/health"

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("slug must contain at least one alphanumeric character")
        if not _SLUG_ALLOWED.match(normalized):
            raise ValueError("slug may only contain lowercase letters, digits, and hyphens")
        return normalized


class ServerUpdate(BaseModel):
    """Schema for updating an existing MCP server registration (all fields optional)."""

    name: str | None = None
    slug: str | None = None
    upstream_url: str | None = None
    transport: ServerTransport | None = None
    auth_mode: ServerAuthMode | None = None
    service_token_env_var: str | None = None
    health_check_path: str | None = None
    status: ServerStatus | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("slug must contain at least one alphanumeric character")
        if not _SLUG_ALLOWED.match(normalized):
            raise ValueError("slug may only contain lowercase letters, digits, and hyphens")
        return normalized


class ServerView(BaseModel):
    """Safe response schema for MCP server data (never exposes service_token_env_var)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    slug: str
    upstream_url: str
    transport: ServerTransport
    auth_mode: ServerAuthMode
    status: ServerStatus
    health_check_path: str
    consecutive_health_failures: int
    last_health_check_at: datetime | None
    created_at: datetime
    updated_at: datetime
