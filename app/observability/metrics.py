"""Prometheus metric definition and exposure boundary."""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

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
    ["server_slug", "scope"],  # scope: "pre_auth" or "per_subject"
)

RBAC_DENIALS = Counter(
    "portcullis_rbac_denials_total",
    "Total requests denied by RBAC",
    ["server_slug"],
)


def metrics_response() -> tuple[bytes, str]:
    """Return ``(body_bytes, content_type)`` ready for a ``/metrics`` response."""
    return generate_latest(), CONTENT_TYPE_LATEST
