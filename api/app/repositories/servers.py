"""Server repository for MCP server CRUD operations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import McpServer, Role, ServerStatus, ToolPermission
from app.models.schemas import ServerCreate, ServerUpdate


class ServerRepository:
    """Data access layer for MCP server records scoped to a tenant."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, tenant_id: UUID, data: ServerCreate) -> McpServer:
        """Persist a new MCP server record and return the ORM instance."""
        server = McpServer(
            tenant_id=tenant_id,
            name=data.name,
            slug=data.slug,
            upstream_url=data.upstream_url,
            transport=data.transport,
            auth_mode=data.auth_mode,
            service_token_env_var=data.service_token_env_var,
            ssl_ca=data.ssl_ca,
            ssl_cert=data.ssl_cert,
            ssl_key=data.ssl_key,
            health_check_path=data.health_check_path,
            status=ServerStatus.ACTIVE,
        )
        self._session.add(server)
        await self._session.flush()
        return server

    async def list(self, tenant_id: UUID) -> list[McpServer]:
        """Return all MCP server records for the given tenant."""
        result = await self._session.scalars(
            select(McpServer).where(McpServer.tenant_id == tenant_id)
        )
        return list(result.all())

    async def count(self, tenant_id: UUID) -> int:
        """Return the number of MCP servers registered for the tenant."""
        result = await self._session.scalar(
            select(func.count(McpServer.id)).where(McpServer.tenant_id == tenant_id)
        )
        return int(result or 0)

    async def get_by_slug(self, tenant_id: UUID, slug: str) -> McpServer | None:
        """Return the MCP server with the given slug, or None if not found."""
        result = await self._session.scalars(
            select(McpServer).where(
                McpServer.tenant_id == tenant_id,
                McpServer.slug == slug,
            )
        )
        return result.first()

    async def update(self, server: McpServer, data: ServerUpdate) -> McpServer:
        """Apply the non-None fields from data to the server ORM instance."""
        if data.name is not None:
            server.name = data.name
        if data.slug is not None:
            server.slug = data.slug
        if data.upstream_url is not None:
            server.upstream_url = data.upstream_url
        if data.transport is not None:
            server.transport = data.transport
        if data.auth_mode is not None:
            server.auth_mode = data.auth_mode
        if data.service_token_env_var is not None:
            server.service_token_env_var = data.service_token_env_var
        if data.ssl_ca is not None:
            server.ssl_ca = data.ssl_ca
        if data.ssl_cert is not None:
            server.ssl_cert = data.ssl_cert
        if data.ssl_key is not None:
            server.ssl_key = data.ssl_key
        if data.health_check_path is not None:
            server.health_check_path = data.health_check_path
        if data.status is not None:
            server.status = data.status
        await self._session.flush()
        return server

    async def delete(self, server: McpServer) -> None:
        """Remove an MCP server record from the database."""
        await self._session.delete(server)
        await self._session.flush()

    async def delete_exact_slug_permissions(self, tenant_id: UUID, slug: str) -> None:
        """Delete ToolPermission rows whose server_pattern exactly matches slug.

        Only removes exact-slug rules (not wildcard rules), scoped to the tenant.
        """
        tenant_role_ids = select(Role.id).where(Role.tenant_id == tenant_id)
        await self._session.execute(
            delete(ToolPermission).where(
                ToolPermission.server_pattern == slug,
                ToolPermission.role_id.in_(tenant_role_ids),
            )
        )
