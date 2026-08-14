"""Integration tests for the RbacRepository (require Docker)."""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="requires Docker")
async def test_rbac_repository_placeholder() -> None:
    """Placeholder: full integration tests require a running Postgres container."""
