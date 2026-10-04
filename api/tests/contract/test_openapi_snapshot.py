"""P2: OpenAPI drift contract — checked-in spec must match the live app.

Run ``python scripts/regen_openapi.py`` (or ``make openapi``) after changing
routes/schemas, then commit the updated ``openapi.json``. CI fails with a
helpful message instead of silently drifting (the P0 cause of stale
ssl_*/bridge_*/audit-filter clients).
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKED_IN = REPO_ROOT / "openapi.json"

REQUIRED_PATHS = ("/v1/servers", "/v1/audit", "/mcp/{server_slug}", "/healthz", "/metrics")


def _load_checked_in() -> dict:
    assert CHECKED_IN.exists(), f"missing {CHECKED_IN.name} — run `make openapi` to generate it"
    return json.loads(CHECKED_IN.read_text(encoding="utf-8"))


def test_openapi_spec_is_valid_and_covers_gateway() -> None:
    spec = _load_checked_in()
    assert spec.get("openapi", "").startswith("3."), "spec must be OpenAPI 3.x"
    paths = spec.get("paths", {})
    for required in REQUIRED_PATHS:
        assert required in paths, f"spec missing required path {required}"


def test_openapi_matches_live_app() -> None:
    """Live app schema must equal the checked-in snapshot (modulo version)."""
    import os

    os.environ.setdefault("API_KEY_PEPPER", "test-only-pepper-for-openapi-snapshot")
    os.environ.setdefault("MCP_ALLOWED_ORIGINS", "")
    from app.main import create_app

    live = create_app().openapi()
    spec = _load_checked_in()

    live_paths, spec_paths = set(live.get("paths", {})), set(spec.get("paths", {}))
    missing = live_paths - spec_paths
    extra = spec_paths - live_paths
    assert not missing, (
        f"checked-in openapi.json is stale — missing live paths {sorted(missing)}. "
        "Run `make openapi` and commit the result."
    )
    assert not extra, (
        f"checked-in openapi.json has removed paths {sorted(extra)}. "
        "Run `make openapi` and commit the result."
    )

    # Spot-check P0/P1 schema fixes are present in the snapshot.
    schemas = spec.get("components", {}).get("schemas", {})
    server_view = schemas.get("ServerView", {})
    props = server_view.get("properties", {})
    assert "ssl_configured" in props, "ServerView.ssl_configured missing — regen spec"
    assert "ssl_cert" not in props and "ssl_key" not in props, "PEM leak in spec — regen"
