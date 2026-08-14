"""Environment-driven application configuration boundary."""

from __future__ import annotations

import re
from enum import StrEnum
from functools import lru_cache
from typing import Annotated, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEVELOPMENT_API_KEY_PEPPER = "development-only-change-me"
RATE_LIMIT_PATTERN = re.compile(r"^[1-9]\d*/(?:second|minute|hour|day)$")
CsvTuple = Annotated[tuple[str, ...], NoDecode]
PositiveFloat = Annotated[float, Field(gt=0)]
PositiveInt = Annotated[int, Field(gt=0)]


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
    api_key_pepper: str = Field(default=DEVELOPMENT_API_KEY_PEPPER, min_length=16)
    environment: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    cors_allowed_origins: CsvTuple = ("*",)
    upstream_allowed_hosts: CsvTuple = ("localhost", "127.0.0.1")
    upstream_connect_timeout_seconds: PositiveFloat = 5.0
    upstream_read_timeout_seconds: PositiveFloat = 30.0
    health_check_interval_seconds: PositiveFloat = 30.0
    health_check_failure_threshold: PositiveInt = 3
    rate_limit_default: str = "100/minute"
    auth_rate_limit_default: str = "20/minute"

    # OAuth 2.1 / JWKS — all optional; JWT auth is disabled when jwks_url is unset
    jwt_jwks_url: str | None = None
    jwt_issuer: str | None = None
    jwt_audience: str = "portcullis"
    jwt_jwks_cache_ttl_seconds: PositiveInt = 300

    # OpenTelemetry — disabled when endpoint is unset
    otel_endpoint: str | None = None
    otel_service_name: str = "portcullis"

    # Prometheus metrics endpoint
    metrics_enabled: bool = True

    @field_validator("cors_allowed_origins", "upstream_allowed_hosts", mode="before")
    @classmethod
    def parse_csv_tuple(cls, value: object) -> object:
        """Parse comma-separated environment values into immutable tuples."""
        if not isinstance(value, str):
            return value
        parsed = tuple(item.strip() for item in value.split(",") if item.strip())
        if not parsed:
            raise ValueError("must contain at least one value")
        return parsed

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        """Normalize and constrain the configured application log level."""
        normalized = value.upper()
        if normalized not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            raise ValueError("must be a valid Python log level")
        return normalized

    @field_validator("rate_limit_default", "auth_rate_limit_default")
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide immutable configuration snapshot."""
    return Settings()
