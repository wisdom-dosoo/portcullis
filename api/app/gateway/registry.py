"""Upstream MCP server registry boundary."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.licenses import LicenseEntitlementError, require_license
from app.config import Settings
from app.models.orm import ServerAuthMode
from app.models.schemas import ServerCreate, ServerUpdate, ServerView
from app.repositories.servers import ServerRepository
from app.security.upstreams import validate_upstream_url

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


class SlugConflictError(ValueError):
    """Raised when a server slug already exists in the registry."""


class RegistryService:
    """CRUD service for managing upstream MCP server registrations."""

    def __init__(
        self, session: AsyncSession, settings: Settings, tenant_id: UUID | None = None
    ) -> None:
        self._repo = ServerRepository(session)
        self._session = session
        self._settings = settings
        self._tenant_id = tenant_id if tenant_id is not None else DEFAULT_TENANT_ID

    async def create(self, command: ServerCreate, tenant_id: UUID | None = None) -> ServerView:
        """Register a new upstream MCP server.

        Raises:
            ValueError: if the URL fails validation, env var is missing for
                        service_token auth, or the slug already exists.
        """
        tid = tenant_id if tenant_id is not None else self._tenant_id
        validate_upstream_url(
            command.upstream_url,
            self._settings.upstream_hosts_tuple,
            self._settings.environment,
        )

        if command.auth_mode == ServerAuthMode.SERVICE_TOKEN and not command.service_token_env_var:
            raise ValueError("service_token_env_var is required when auth_mode is 'service_token'")

        # Enforce license entitlement before allowing a new server registration.
        try:
            await require_license(
                self._session,
                tid,
                users=0,
                servers=await self._repo.count(tid) + 1,
            )
        except LicenseEntitlementError as exc:
            raise ValueError(str(exc)) from exc

        try:
            server = await self._repo.create(tid, command)
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise SlugConflictError(f"A server with slug '{command.slug}' already exists") from exc

        return ServerView.model_validate(server)

    async def list(self, tenant_id: UUID | None = None) -> list[ServerView]:
        """Return all registered MCP servers for the given tenant."""
        tid = tenant_id if tenant_id is not None else self._tenant_id
        servers = await self._repo.list(tid)
        return [ServerView.model_validate(s) for s in servers]

    async def get(self, slug: str, tenant_id: UUID | None = None) -> ServerView:
        """Return the MCP server with the given slug.

        Raises:
            KeyError: if no server with the given slug exists.
        """
        tid = tenant_id if tenant_id is not None else self._tenant_id
        server = await self._repo.get_by_slug(tid, slug)
        if server is None:
            raise KeyError(f"Server '{slug}' not found")
        return ServerView.model_validate(server)

    async def update(
        self, slug: str, command: ServerUpdate, tenant_id: UUID | None = None
    ) -> ServerView:
        """Update an existing MCP server registration.

        Raises:
            KeyError:   if no server with the given slug exists.
            ValueError: if the updated URL fails validation, the
                        auth_mode/service-token invariant is violated, or the new
                        slug collides with another server.
            SlugConflictError: if the new slug already belongs to another server.
        """
        tid = tenant_id if tenant_id is not None else self._tenant_id
        server = await self._repo.get_by_slug(tid, slug)
        if server is None:
            raise KeyError(f"Server '{slug}' not found")

        if command.upstream_url is not None:
            validate_upstream_url(
                command.upstream_url,
                self._settings.upstream_hosts_tuple,
                self._settings.environment,
            )

        # Revalidate the auth_mode / service-token invariant against the merged
        # state: a server must not end up in service_token mode without a token
        # env var after the update is applied.
        final_auth_mode = command.auth_mode if command.auth_mode is not None else server.auth_mode
        final_token_env = (
            command.service_token_env_var
            if command.service_token_env_var is not None
            else server.service_token_env_var
        )
        if final_auth_mode == ServerAuthMode.SERVICE_TOKEN and not final_token_env:
            raise ValueError("service_token_env_var is required when auth_mode is 'service_token'")

        try:
            server = await self._repo.update(server, command)
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise SlugConflictError(f"A server with slug '{command.slug}' already exists") from exc

        return ServerView.model_validate(server)

    async def delete(self, slug: str, tenant_id: UUID | None = None) -> None:
        """Delete an MCP server and its exact-slug tool permissions.

        Raises:
            KeyError: if no server with the given slug exists.
        """
        tid = tenant_id if tenant_id is not None else self._tenant_id
        server = await self._repo.get_by_slug(tid, slug)
        if server is None:
            raise KeyError(f"Server '{slug}' not found")

        await self._repo.delete_exact_slug_permissions(tid, slug)
        await self._repo.delete(server)
        await self._session.commit()
