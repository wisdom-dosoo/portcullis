"""Gap 4: Deploy hardening verification — no Docker required."""

from __future__ import annotations

import pathlib


def test_dockerfile_healthcheck_uses_python_not_wget() -> None:
    content = (pathlib.Path("deploy/Dockerfile")).read_text()
    assert "HEALTHCHECK" in content
    assert "python -c" in content
    assert "wget" not in content, "Dockerfile must not use wget (not installed in slim image)"


def test_entrypoint_uses_advisory_lock() -> None:
    content = (pathlib.Path("deploy/entrypoint.sh")).read_text()
    assert "pg_advisory_lock" in content
    assert "724286549" in content
    assert "asyncpg" in content


def test_requirements_are_pinned() -> None:
    content = (pathlib.Path("requirements.txt")).read_text()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Runtime lines must be pinned with ==; dev extras may be loose (pip-audit)
        if line.startswith("pip-audit"):
            continue
        assert "==" in line, f"unpinned dependency: {line}"


def test_cors_rejects_wildcard_in_production() -> None:
    from app.config import Settings, Environment

    try:
        Settings(environment=Environment.PRODUCTION, cors_allowed_origins="*", api_key_pepper="test-pepper-12345678", mcp_allowed_origins="https://example.com")
        raise AssertionError("should have rejected wildcard CORS in production")
    except ValueError as exc:
        assert "CORS_ALLOWED_ORIGINS" in str(exc)


def test_mcp_origins_required_in_production() -> None:
    from app.config import Settings, Environment

    try:
        Settings(environment=Environment.PRODUCTION, cors_allowed_origins="https://example.com", api_key_pepper="test-pepper-12345678", mcp_allowed_origins="")
        raise AssertionError("should have rejected empty MCP origins in production")
    except ValueError as exc:
        assert "MCP_ALLOWED_ORIGINS" in str(exc)


def test_next_config_has_mcp_rewrite() -> None:
    content = (pathlib.Path("../web/next.config.ts")).read_text()
    assert 'source: "/mcp/:path*"' in content
    assert "destination" in content


def test_orval_config_points_to_live_backend() -> None:
    content = (pathlib.Path("../web/orval.config.ts")).read_text()
    assert "openapi.json" in content
    assert "localhost:8000" in content
