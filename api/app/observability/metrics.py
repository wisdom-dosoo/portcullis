"""Prometheus metric definition and exposure boundary."""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

REQUESTS_TOTAL = Counter(
    "portcullis_requests_total",
    "Total MCP proxy requests processed",
    ["server_slug", "method", "status_code"],
)

REQUEST_DURATION = Histogram(
    "portcullis_request_duration_seconds",
    "MCP proxy request duration in seconds",
    ["server_slug", "method"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

AUTH_FAILURES = Counter(
    "portcullis_auth_failures_total",
    "Total authentication failures",
    ["reason"],  # "invalid_key", "invalid_token", "missing_credentials"
)

RATE_LIMIT_REJECTIONS = Counter(
    "portcullis_rate_limit_rejections_total",
    "Total requests rejected by rate limiting",
    ["server_slug", "scope"],  # scope: "pre_auth" or "per_subject" or "management_api"
)

RBAC_DENIALS = Counter(
    "portcullis_rbac_denials_total",
    "Total requests denied by RBAC",
    ["server_slug"],
)

# Upstream metrics
UPSTREAM_HEALTH = Gauge(
    "portcullis_upstream_health",
    "Upstream server health status (1=healthy, 0=unhealthy, -1=degraded)",
    ["server_slug"],
)

UPSTREAM_REQUEST_DURATION = Histogram(
    "portcullis_upstream_request_duration_seconds",
    "Upstream server request duration in seconds",
    ["server_slug"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
)

UPSTREAM_CONSECUTIVE_FAILURES = Gauge(
    "portcullis_upstream_consecutive_failures",
    "Number of consecutive health check failures",
    ["server_slug"],
)

# Origin validation
ORIGIN_VALIDATION_FAILURES = Counter(
    "portcullis_origin_validation_failures_total",
    "Total requests rejected due to Origin header validation failure",
    [],
)

# API key usage
API_KEY_USAGE = Counter(
    "portcullis_api_key_usage_total",
    "Total API key usage",
    ["key_prefix", "result"],  # result: "allowed", "denied", "revoked"
)

# Usage/billing metrics
USAGE_TOOL_CALLS_TOTAL = Counter(
    "portcullis_usage_tool_calls_total",
    "Total tool calls for billing/usage tracking",
    ["tenant_id"],
)

USAGE_MONTHLY_CAP = Gauge(
    "portcullis_usage_monthly_cap",
    "Monthly tool call cap for tenant (0 = unlimited)",
    ["tenant_id"],
)

# License metrics
LICENSE_EXPIRES_AT_TIMESTAMP = Gauge(
    "portcullis_license_expires_at_timestamp",
    "License expiration timestamp (Unix epoch)",
    ["tenant_id"],
)

def metrics_response() -> tuple[bytes, str]:
    """Return ``(body_bytes, content_type)`` ready for a ``/metrics`` response."""
    return generate_latest(), CONTENT_TYPE_LATEST
