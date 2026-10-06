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
    from app.config import Environment, Settings

    try:
        Settings(
            environment=Environment.PRODUCTION,
            cors_allowed_origins="*",
            api_key_pepper="test-pepper-12345678",
            mcp_allowed_origins="https://example.com",
        )
        raise AssertionError("should have rejected wildcard CORS in production")
    except ValueError as exc:
        assert "CORS_ALLOWED_ORIGINS" in str(exc)


def test_mcp_origins_required_in_production() -> None:
    from app.config import Environment, Settings

    try:
        Settings(
            environment=Environment.PRODUCTION,
            cors_allowed_origins="https://example.com",
            api_key_pepper="test-pepper-12345678",
            mcp_allowed_origins="",
        )
        raise AssertionError("should have rejected empty MCP origins in production")
    except ValueError as exc:
        assert "MCP_ALLOWED_ORIGINS" in str(exc)


def test_forwarded_allow_ips_rejects_star_in_production() -> None:
    from app.config import Environment, Settings

    try:
        Settings(
            environment=Environment.PRODUCTION,
            cors_allowed_origins="https://example.com",
            api_key_pepper="test-pepper-12345678",
            mcp_allowed_origins="https://example.com",
            forwarded_allow_ips="*",
        )
        raise AssertionError("should have rejected '*' forwarded trust in production")
    except ValueError as exc:
        assert "FORWARDED_ALLOW_IPS" in str(exc)


def test_entrypoint_does_not_trust_all_proxies() -> None:
    content = (pathlib.Path("deploy/entrypoint.sh")).read_text()
    assert "--forwarded-allow-ips '*'" not in content
    assert "FORWARDED_ALLOW_IPS" in content
    assert "SKIP_MIGRATIONS" in content


def test_migrate_job_exists_for_pgbouncer() -> None:
    content = (pathlib.Path("../deploy/k8s/helm/portcullis/templates/migrate-job.yaml")).read_text()
    assert "DATABASE_URL_DIRECT" in content
    assert "helm.sh/hook" in content


def test_audit_retention_and_dlq_wired() -> None:
    from app.config import Settings

    settings = Settings(
        api_key_pepper="test-pepper-12345678",
        audit_retention_days=400,
        audit_dlq_path="/var/run/portcullis-audit-dlq.jsonl",
    )
    assert settings.audit_retention_days == 400
    assert settings.audit_dlq_path.endswith(".jsonl")


def test_next_config_has_mcp_rewrite() -> None:
    content = (pathlib.Path("../web/next.config.ts")).read_text()
    assert 'source: "/mcp/:path*"' in content
    assert "destination" in content


def test_orval_config_points_to_live_backend() -> None:
    content = (pathlib.Path("../web/orval.config.ts")).read_text()
    assert "openapi.json" in content
    assert "localhost:8000" in content
