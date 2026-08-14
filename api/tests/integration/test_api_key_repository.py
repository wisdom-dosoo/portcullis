"""Integration tests for the ApiKeyRepository (require Docker)."""

from __future__ import annotations

import pytest


@pytest.mark.skip(reason="requires Docker")
async def test_api_key_repository_placeholder() -> None:
    """Placeholder: full integration tests require a running Postgres container."""
