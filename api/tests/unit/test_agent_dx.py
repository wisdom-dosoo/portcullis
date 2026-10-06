"""Agent-DX: discovery endpoints + MCP config builder + dry_run."""

from __future__ import annotations

import json
from argparse import Namespace
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.cli import _print_mcp_config, build_mcp_config


def test_build_mcp_config_shape() -> None:
    cfg = build_mcp_config("github-mcp", "https://gw.example.com/", "PORTCULLIS_API_KEY")
    assert cfg["url"] == "https://gw.example.com/mcp/github-mcp"
    assert cfg["transport"] == "streamable_http"
    assert cfg["headers"] == {"Authorization": "Bearer $PORTCULLIS_API_KEY"}


def test_print_mcp_config_claude(capsys: pytest.CaptureFixture[str]) -> None:
    args = Namespace(server="github-mcp", base_url="http://localhost:8080", client="claude", api_key_env="DOES_NOT_EXIST_XYZ")
    _print_mcp_config(args)
    out = capsys.readouterr().out
    body = json.loads(out)
    # _print_mcp_config prints pure JSON for claude (plus no extra line)
    assert "mcpServers" in body
    assert body["mcpServers"]["github-mcp"]["url"] == "http://localhost:8080/mcp/github-mcp"


@pytest.mark.asyncio
async def test_well_known_mcp_card() -> None:
    from app.main import create_app

    app = create_app()
    # inject dummy runtime so lifespan state not needed for discovery (no DB touch)
    app.state.runtime = MagicMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/.well-known/mcp.json")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "portcullis"
    assert "{server_slug}" in body["proxy"]["route"]
    assert "-32002" in body["error_codes"]


@pytest.mark.asyncio
async def test_oauth_protected_resource_falls_back_to_api_key() -> None:
    from app.main import create_app

    app = create_app()
    app.state.runtime = MagicMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/.well-known/oauth-protected-resource")
    assert r.status_code == 200
    body = r.json()
    assert "resource" in body
    assert "bearer_methods_supported" in body
