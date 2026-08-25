"""Environment-driven application configuration boundary."""

from __future__ import annotations

import re
from enum import StrEnum
from functools import lru_cache
from typing import Annotated, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_API_KEY_PEPPER = "development-only-change-me"
RATE_LIMIT_PATTERN = re.compile(r"^[1-9]\d*/(?:second|minute|hour|day)$")


PositiveFloat = Annotated[float, Field(gt=0)]
PositiveInt = Annotated[int, Field(gt=0)]


class RedisMode(StrEnum):
    """Redis deployment modes for HA support."""

    STANDALONE = "standalone"
    SENTINEL = "sentinel"
    CLUSTER = "cluster"


class Environment(StrEnum):
    """Supported deployment environments."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Validated process configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        validate_default=True,
    )

    database_url: str = "postgresql+asyncpg://portcullis:portcullis@localhost:5432/portcullis"
    redis_url: str = "redis://localhost:6379/0"
    redis_mode: RedisMode = RedisMode.STANDALONE
    redis_sentinel_master: str | None = None
    redis_sentinel_hosts: str = ""
    redis_max_connections: PositiveInt = 50
    redis_socket_timeout_seconds: PositiveFloat = 5.0
    redis_socket_connect_timeout_seconds: PositiveFloat = 5.0
    api_key_pepper: str = Field(default=DEVELOPMENT_API_KEY_PEPPER, min_length=16)
    environment: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    cors_allowed_origins: str = "*"
    upstream_allowed_hosts: str = "localhost,127.0.0.1"
    upstream_connect_timeout_seconds: PositiveFloat = 5.0
    upstream_read_timeout_seconds: PositiveFloat = 30.0
    health_check_interval_seconds: PositiveFloat = 30.0
    health_check_failure_threshold: PositiveInt = 3
    rate_limit_default: str = "100/minute"
    auth_rate_limit_default: str = "20/minute"
    management_api_rate_limit_default: str = "100/minute"
    max_request_body_bytes: PositiveInt = 1_048_576

    # Origin allow-list for production DNS rebinding protection
    # When set in production, the Origin header is validated against this list
    # for MCP proxy endpoints. Format: comma-separated list of origins.
    # Example: "https://claude.ai,https://cursor.sh"
    mcp_allowed_origins: str = ""

    # OAuth 2.1 / JWKS — all optional; JWT auth is disabled when jwks_url is unset
    jwt_jwks_url: str | None = None
    jwt_issuer: str | None = None
    jwt_audience: str = "portcullis"
    jwt_jwks_cache_ttl_seconds: PositiveInt = 300

    # OIDC SSO (authorization-code login). All optional; SSO is disabled when
    # sso_oidc_client_id is unset.  The client secret lives only in process
    # config — never in the database — so self-hosted deployments point these
    # at their own IdP and the Cloud control plane supplies them per-tenant.
    sso_enabled: bool = False
    sso_oidc_name: str = "SSO"
    sso_oidc_slug: str = "sso"
    sso_oidc_issuer: str | None = None
    sso_oidc_client_id: str | None = None
    sso_oidc_client_secret: str | None = None
    sso_oidc_authorize_url: str | None = None
    sso_oidc_token_url: str | None = None
    sso_oidc_userinfo_url: str | None = None
    sso_oidc_scope: str = "openid email profile"
    # Public base URL of this Portcullis instance — used to build the SSO
    # callback URL the IdP redirects back to.
    sso_public_base_url: str = "http://localhost:8000"
    # IdP logout URL for single logout (SLO). Optional.
    sso_oidc_logout_url: str | None = None

    # Usage metering / billing-tier enforcement. Metering always records usage;
    # enforcement is opt-in so self-hosted deployments stay unlimited by
    # default.  When enabled, proxied tool calls above the plan's monthly
    # request cap are rejected with HTTP 402.
    usage_enforcement_enabled: bool = False
    # plan -> monthly request cap (0 = unlimited). Overridable per deployment.
    usage_monthly_cap_community: int = 1_000_000
    usage_monthly_cap_pro: int = 5_000_000
    usage_monthly_cap_enterprise: int = 0

    # Anonymous self-host telemetry (Phase 4 strategy review).  When enabled,
    # self-hosted installs may send an opt-in heartbeat so the operator can
    # count installs and track the self-host -> Cloud conversion funnel.
    # Default is OFF: the project's trust position forbids mandatory
    # phone-home, and self-host data is always treated as a lower bound.
    telemetry_enabled: bool = False
    # Where to send heartbeats (the operator's /v1/telemetry/heartbeat).
    # Reporter stays idle while unset, even if telemetry_enabled is true.
    telemetry_endpoint_url: str | None = None
    # Heartbeat cadence.  The admin "active_24h" view assumes a cadence well
    # under a day, so this defaults to hourly.
    telemetry_interval_seconds: PositiveInt = 3600
    # Install identity.  When unset, the gateway generates a UUID on first
    # boot and persists it to telemetry_state_file so the install keeps the
    # same anonymous id across restarts (and across migrations to Cloud).
    telemetry_install_id: str | None = None
    telemetry_state_file: str = ".portcullis/install_id"

    # Email delivery — pluggable providers (console, smtp, sendgrid, resend)
    email_provider: str = "console"
    email_from: str = "noreply@portcullis.local"
    email_from_name: str = "Portcullis"
    # SMTP
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool | None = True
    smtp_use_ssl: bool | None = False
    # SendGrid
    sendgrid_api_key: str | None = None
    # Resend
    resend_api_key: str | None = None

    # Stripe billing
    stripe_webhook_secret: str | None = None
    stripe_api_key: str | None = None
    stripe_price_id_pro: str | None = None
    stripe_price_id_enterprise: str | None = None

    # OpenTelemetry — disabled when endpoint is unset
    otel_endpoint: str | None = None
    otel_service_name: str = "portcullis"

    # Prometheus metrics endpoint
    metrics_enabled: bool = True

    @property
    def cors_origins_tuple(self) -> tuple[str, ...]:
        """Parse CORS_ALLOWED_ORIGINS into a tuple of strings."""
        if not self.cors_allowed_origins:
            return ()
        return tuple(item.strip() for item in self.cors_allowed_origins.split(",") if item.strip())

    @property
    def upstream_hosts_tuple(self) -> tuple[str, ...]:
        """Parse UPSTREAM_ALLOWED_HOSTS into a tuple of strings."""
        if not self.upstream_allowed_hosts:
            return ()
        return tuple(item.strip() for item in self.upstream_allowed_hosts.split(",") if item.strip())

    @property
    def mcp_allowed_origins_tuple(self) -> tuple[str, ...]:
        """Parse MCP_ALLOWED_ORIGINS into a tuple of strings."""
        if not self.mcp_allowed_origins:
            return ()
        return tuple(item.strip() for item in self.mcp_allowed_origins.split(",") if item.strip())

    @model_validator(mode="after")
    def validate_mcp_allowed_origins_in_production(self) -> Self:
        """Require MCP_ALLOWED_ORIGINS to be set in production for DNS rebinding protection."""
        if (
            self.environment is Environment.PRODUCTION
            and not self.mcp_allowed_origins_tuple
        ):
            raise ValueError(
                "MCP_ALLOWED_ORIGINS must be set in production to prevent DNS rebinding attacks. "
                "Set a comma-separated list of allowed origins (e.g., 'https://claude.ai,https://cursor.sh')"
            )
        return self

    @property
    def redis_sentinel_hosts_tuple(self) -> tuple[tuple[str, int], ...]:
        """Parse REDIS_SENTINEL_HOSTS into a tuple of (host, port) tuples.

        Format: "host1:port1,host2:port2,host3:port3"
        """
        if not self.redis_sentinel_hosts:
            return ()
        result = []
        for item in self.redis_sentinel_hosts.split(","):
            item = item.strip()
            if not item:
                continue
            if ":" not in item:
                raise ValueError(f"Invalid sentinel host format: '{item}', expected 'host:port'")
            host, port_str = item.rsplit(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                raise ValueError(f"Invalid port in sentinel host: '{item}'")
            result.append((host, port))
        return tuple(result)

    @field_validator("redis_mode")
    @classmethod
    def validate_redis_mode(cls, value: RedisMode) -> RedisMode:
        """Validate Redis mode."""
        if value not in {RedisMode.STANDALONE, RedisMode.SENTINEL, RedisMode.CLUSTER}:
            raise ValueError(f"redis_mode must be one of: {[m.value for m in RedisMode]}")
        return value

    @model_validator(mode="after")
    def validate_redis_sentinel_config(self) -> Self:
        """Validate Sentinel configuration when mode is sentinel."""
        if self.redis_mode == RedisMode.SENTINEL:
            if not self.redis_sentinel_master:
                raise ValueError("REDIS_SENTINEL_MASTER is required when REDIS_MODE=sentinel")
            if not self.redis_sentinel_hosts_tuple:
                raise ValueError("REDIS_SENTINEL_HOSTS is required when REDIS_MODE=sentinel")
        return self

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        """Normalize and constrain the configured application log level."""
        normalized = value.upper()
        if normalized not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            raise ValueError("must be a valid Python log level")
        return normalized

    @field_validator("rate_limit_default", "auth_rate_limit_default", "management_api_rate_limit_default")
    @classmethod
    def validate_rate_limit(cls, value: str) -> str:
        """Validate the compact default rate-limit syntax."""
        if RATE_LIMIT_PATTERN.fullmatch(value) is None:
            raise ValueError("must use a positive '<requests>/<unit>' value")
        return value

    @model_validator(mode="after")
    def reject_insecure_production_pepper(self) -> Self:
        """Prevent production startup with the public development pepper."""
        if (
            self.environment is Environment.PRODUCTION
            and self.api_key_pepper == DEVELOPMENT_API_KEY_PEPPER
        ):
            raise ValueError("API_KEY_PEPPER must be changed for production")
        return self

    @model_validator(mode="after")
    def reject_wildcard_cors_in_production(self) -> Self:
        """Never allow a wildcard CORS origin with credentials in production.

        ``allow_origins=("*")`` combined with ``allow_credentials=True`` is
        invalid browser behavior AND lets any origin issue credentialed requests.
        """
        if self.environment is Environment.PRODUCTION:
            if "*" in self.cors_origins_tuple:
                raise ValueError("CORS_ALLOWED_ORIGINS must not include '*' in production")
            if not self.cors_origins_tuple:
                raise ValueError("CORS_ALLOWED_ORIGINS must list explicit origins in production")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide immutable configuration snapshot."""
    return Settings()