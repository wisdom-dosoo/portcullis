"""Tests for environment-driven gateway settings."""

from collections.abc import Iterator

import pytest
from pydantic import ValidationError

from app import config

CONFIG_ENV_VARS = (
    "DATABASE_URL",
    "REDIS_URL",
    "API_KEY_PEPPER",
    "ENVIRONMENT",
    "LOG_LEVEL",
    "CORS_ALLOWED_ORIGINS",
    "UPSTREAM_ALLOWED_HOSTS",
    "UPSTREAM_CONNECT_TIMEOUT_SECONDS",
    "UPSTREAM_READ_TIMEOUT_SECONDS",
    "HEALTH_CHECK_INTERVAL_SECONDS",
    "HEALTH_CHECK_FAILURE_THRESHOLD",
    "RATE_LIMIT_DEFAULT",
    "AUTH_RATE_LIMIT_DEFAULT",
)


@pytest.fixture(autouse=True)
def clean_settings_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keep local shell configuration from affecting deterministic settings tests."""
    for variable_name in CONFIG_ENV_VARS:
        monkeypatch.delenv(variable_name, raising=False)
    yield


def test_settings_have_safe_development_defaults() -> None:
    settings = config.Settings(_env_file=None)

    assert settings.environment is config.Environment.DEVELOPMENT
    assert settings.database_url == (
        "postgresql+asyncpg://portcullis:portcullis@localhost:5432/portcullis"
    )
    assert settings.redis_url == "redis://localhost:6379/0"
    assert settings.cors_origins_tuple == ("*",)
    assert settings.upstream_hosts_tuple == ("localhost", "127.0.0.1")
    assert settings.rate_limit_default == "100/minute"
    assert settings.auth_rate_limit_default == "20/minute"


def test_settings_parse_csv_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        "https://admin.example.com, https://ops.example.com",
    )

    settings = config.Settings(_env_file=None)

    assert settings.cors_origins_tuple == (
        "https://admin.example.com",
        "https://ops.example.com",
    )


def test_settings_parse_allowed_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@db/gateway")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("API_KEY_PEPPER", "a-secure-test-pepper")
    monkeypatch.setenv("UPSTREAM_ALLOWED_HOSTS", "mcp.internal,tools.internal")

    assert config.Settings(_env_file=None).upstream_hosts_tuple == (
        "mcp.internal",
        "tools.internal",
    )


@pytest.mark.parametrize(
    ("variable_name", "invalid_value"),
    (
        ("UPSTREAM_CONNECT_TIMEOUT_SECONDS", "0"),
        ("UPSTREAM_READ_TIMEOUT_SECONDS", "-1"),
        ("HEALTH_CHECK_INTERVAL_SECONDS", "0"),
        ("HEALTH_CHECK_FAILURE_THRESHOLD", "0"),
    ),
)
def test_settings_reject_non_positive_limits(
    monkeypatch: pytest.MonkeyPatch,
    variable_name: str,
    invalid_value: str,
) -> None:
    monkeypatch.setenv(variable_name, invalid_value)

    with pytest.raises(ValidationError):
        config.Settings(_env_file=None)


def test_production_rejects_development_pepper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("API_KEY_PEPPER", "development-only-change-me")
    monkeypatch.setenv("MCP_ALLOWED_ORIGINS", "https://example.com")

    with pytest.raises(ValidationError, match="API_KEY_PEPPER"):
        config.Settings(_env_file=None)


def test_sso_defaults_disabled() -> None:
    settings = config.Settings(_env_file=None)
    assert settings.sso_enabled is False
    assert settings.sso_oidc_client_id is None
    assert settings.sso_oidc_scope == "openid email profile"
    assert settings.sso_public_base_url == "http://localhost:8000"


def test_usage_defaults_unlimited_but_metered() -> None:
    settings = config.Settings(_env_file=None)
    assert settings.usage_enforcement_enabled is False
    assert settings.usage_monthly_cap_community == 1_000_000
    assert settings.usage_monthly_cap_pro == 5_000_000
    assert settings.usage_monthly_cap_enterprise == 0
