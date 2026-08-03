"""Pydantic request and response schema boundary."""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.orm import PermissionEffect, ServerAuthMode, ServerStatus, ServerTransport

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


class ApiKeyCreate(BaseModel):
    """Schema for creating a new API key."""

    name: str
    scopes: list[str] = []


class ApiKeyView(BaseModel):
    """Safe response schema for API key data — no hash, no plaintext."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    created_at: datetime
    last_used_at: datetime | None


class ApiKeyCreateResponse(BaseModel):
    """Response returned only at creation — includes one-time plaintext."""

    key: ApiKeyView
    plaintext: str


class RoleCreate(BaseModel):
    """Schema for creating a new role."""

    name: str


class RoleView(BaseModel):
    """Safe response schema for a role."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


class RoleBindingCreate(BaseModel):
    """Schema for binding a subject (API key) to a role."""

    subject_id: UUID


class RoleBindingView(BaseModel):
    """Safe response schema for a role binding."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role_id: UUID
    subject_type: str
    subject_id: UUID
    created_at: datetime


class ToolPermissionCreate(BaseModel):
    """Schema for creating a tool permission rule on a role."""

    server_pattern: str
    tool_pattern: str
    effect: PermissionEffect
    priority: int = 0


class ToolPermissionView(BaseModel):
    """Safe response schema for a tool permission rule."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role_id: UUID
    server_pattern: str
    tool_pattern: str
    effect: PermissionEffect
    priority: int
    created_at: datetime


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
