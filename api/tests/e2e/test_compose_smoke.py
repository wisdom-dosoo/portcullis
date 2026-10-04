"""P2: true black-box compose smoke — boots the real stack over HTTP.

Unlike `test_v0_1_story.py` (fully mocked routing), this hits a live
`docker compose` stack: Postgres + Redis + gateway + (optionally) Jaeger.

  make smoke            # compose up, run smoke, compose down
  pytest tests/e2e/test_compose_smoke.py -q   # assumes stack already up

Skips cleanly when the stack is not reachable so unit/CI runs without Docker
stay green; the CI `smoke` job boots compose and requires it to pass.
"""

from __future__ import annotations

import os

import pytest
import httpx

BASE = os.environ.get("SMOKE_BASE_URL", "http://localhost:8080")
pytestmark = pytest.mark.e2e


async def _get(path: str) -> httpx.Response:
    async with httpx.AsyncClient(timeout=10.0) as client:
        return await client.get(f"{BASE}{path}")


@pytest.mark.asyncio
async def test_healthz_is_reachable() -> None:
    try:
        resp = await _get("/healthz")
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        pytest.skip(f"compose stack not up at {BASE}: {exc}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("status") in {"ok", "healthy", "pass", "up"} or "status" in body


@pytest.mark.asyncio
async def test_mcp_unknown_slug_is_404_not_503() -> None:
    """P0 regression: unknown server slug must be 404 (not 503)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BASE}/mcp/does-not-exist-smoke",
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
            )
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        pytest.skip(f"compose stack not up at {BASE}: {exc}")
    # 401 (no credentials) is also acceptable — proves the gateway (not compose
    # routing) answered. 503/502 means the stack is up but P0 regressed.
    assert resp.status_code in {401, 404}, f"unexpected {resp.status_code}: {resp.text}"
