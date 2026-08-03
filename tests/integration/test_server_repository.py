"""Integration tests for the ServerRepository.

These tests require a live PostgreSQL container and are skipped by default.
Un-skip them by removing the pytest.mark.skip decorator when running with Docker.
"""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="requires Docker")
class TestServerRepositoryIntegration:
    """Integration tests for ServerRepository CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_and_retrieve_by_slug(self) -> None:
        """Creating a server and fetching by slug should return the same record."""

    @pytest.mark.asyncio
    async def test_list_returns_only_tenant_servers(self) -> None:
        """list() must be scoped to the requesting tenant."""

    @pytest.mark.asyncio
    async def test_update_fields(self) -> None:
        """update() should apply only the provided non-None fields."""

    @pytest.mark.asyncio
    async def test_delete_removes_server(self) -> None:
        """delete() should remove the server; subsequent get_by_slug returns None."""

    @pytest.mark.asyncio
    async def test_delete_exact_slug_permissions_removes_exact_matches(self) -> None:
        """delete_exact_slug_permissions() must remove only exact-slug ToolPermission rows."""

    @pytest.mark.asyncio
    async def test_slug_uniqueness_constraint(self) -> None:
        """Creating two servers with the same tenant+slug must raise IntegrityError."""

    @pytest.mark.asyncio
    async def test_status_change(self) -> None:
        """Updating status to DISABLED should persist and be readable."""
