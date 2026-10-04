"""Upstream MCP server registry boundary."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.licenses import LicenseEntitlementError, require_license
from app.config import Settings
from app.constants import DEFAULT_TENANT_ID
from app.models.orm import ServerAuthMode, ServerTransport
from app.models.schemas import ServerCreate, ServerUpdate, ServerView
from app.repositories.servers import ServerRepository
from app.security.upstreams import validate_upstream_url


class SlugConflictError(ValueError):
    """Raised when a server slug already exists in the registry."""


def _validate_token_env_allowlist(value: str | None) -> None:
    """Defense-in-depth allow-list check (schemas already validate).

    Raises ValueError for non-conforming names so direct service calls cannot
    bypass Pydantic validation.
    """
    if value is None:
        return
    import re as _re

    if _re.fullmatch(r"PORTCULLIS_UPSTREAM_TOKEN_[A-Z0-9_]{1,64}", value) is None:
        raise ValueError(
            "service_token_env_var must match 'PORTCULLIS_UPSTREAM_TOKEN_[A-Z0-9_]{1,64}'"
        )


def _validate_bridge_command(value: str) -> None:
    """Reject shell metacharacters (P3: exec is shell-less argv, no pipelines).

    The bridge runs `create_subprocess_exec(*argv)` with no shell, so `;`,
    `$()`, backticks, and pipes are never interpreted — but they signal a
    caller that misunderstands the interface (or probes for injection). Fail
    fast with a clear message instead of spawning a confusing binary name.
    """
    import shlex as _shlex

    try:
        argv = _shlex.split(value)
    except ValueError as exc:
        raise ValueError(f"bridge_command does not parse: {exc}") from exc
    if not argv:
        raise ValueError("bridge_command must name an executable")
    if len(value) > 2000:
        raise ValueError("bridge_command is too long")
    for token in argv:
        if any(c in token for c in (";", "|", "&", "$", "`", "\n", "\r")):
            raise ValueError("bridge_command must be a plain argv string (no shell syntax)")


def _to_view(server: object) -> ServerView:
    """Build a write-only-safe ServerView (ssl_configured boolean, no PEM)."""
    view = ServerView.model_validate(server)
    try:
        view.ssl_configured = bool(
            getattr(server, "ssl_ca", None)
            or getattr(server, "ssl_cert", None)
            or getattr(server, "ssl_key", None)
        )
    except Exception:  # noqa: BLE001, S110 - default False on odd mocks
        pass
    return view


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
        _validate_token_env_allowlist(command.service_token_env_var)

        if command.transport == ServerTransport.STDIO_BRIDGE:
            # P3: stdio bridges spawn local subprocesses from bridge_command.
            # Disabled unless the operator opts in (any Developer can otherwise
            # register servers and turn the command into local code execution
            # on whoever runs the bridge worker).
            if not self._settings.stdio_bridge_enabled:
                raise ValueError(
                    "stdio_bridge transport is disabled (set STDIO_BRIDGE_ENABLED=true to opt in)"
                )
            if not command.bridge_command:
                raise ValueError("bridge_command is required when transport is 'stdio_bridge'")
            _validate_bridge_command(command.bridge_command)
        elif (
            command.auth_mode == ServerAuthMode.SERVICE_TOKEN and not command.service_token_env_var
        ):
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

        return _to_view(server)

    async def list(self, tenant_id: UUID | None = None) -> list[ServerView]:
        """Return all registered MCP servers for the given tenant."""
        tid = tenant_id if tenant_id is not None else self._tenant_id
        servers = await self._repo.list(tid)
        return [_to_view(s) for s in servers]

    async def get(self, slug: str, tenant_id: UUID | None = None) -> ServerView:
        """Return the MCP server with the given slug.

        Raises:
            KeyError: if no server with the given slug exists.
        """
        tid = tenant_id if tenant_id is not None else self._tenant_id
        server = await self._repo.get_by_slug(tid, slug)
        if server is None:
            raise KeyError(f"Server '{slug}' not found")
        return _to_view(server)

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
        _validate_token_env_allowlist(final_token_env)

        try:
            server = await self._repo.update(server, command)
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise SlugConflictError(f"A server with slug '{command.slug}' already exists") from exc

        return _to_view(server)

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
