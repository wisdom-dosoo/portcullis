"""Tests for Prometheus metric definitions and the /metrics response helper."""

from __future__ import annotations

import pytest
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram


# ---------------------------------------------------------------------------
# Module-level metrics — label cardinality and increment smoke tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_requests_total_accepts_correct_labels() -> None:
    """REQUESTS_TOTAL must accept the three expected label dimensions."""
    from app.observability.metrics import REQUESTS_TOTAL

    before = REQUESTS_TOTAL.labels(
        server_slug="test-server", method="tools/list", status_code="200"
    )._value.get()
    REQUESTS_TOTAL.labels(
        server_slug="test-server", method="tools/list", status_code="200"
    ).inc()
    after = REQUESTS_TOTAL.labels(
        server_slug="test-server", method="tools/list", status_code="200"
    )._value.get()

    assert after == before + 1.0


@pytest.mark.asyncio
async def test_request_duration_accepts_correct_labels() -> None:
    """REQUEST_DURATION must accept server_slug and method labels."""
    from app.observability.metrics import REQUEST_DURATION

    REQUEST_DURATION.labels(server_slug="test-server", method="tools/call").observe(0.42)
    # If the labels are wrong prometheus_client raises; reaching here is enough.


@pytest.mark.asyncio
async def test_auth_failures_accepts_reason_label() -> None:
    """AUTH_FAILURES must accept the reason label with expected values."""
    from app.observability.metrics import AUTH_FAILURES

    for reason in ("invalid_key", "invalid_token", "missing_credentials"):
        before = AUTH_FAILURES.labels(reason=reason)._value.get()
        AUTH_FAILURES.labels(reason=reason).inc()
        after = AUTH_FAILURES.labels(reason=reason)._value.get()
        assert after == before + 1.0


@pytest.mark.asyncio
async def test_rate_limit_rejections_accepts_correct_labels() -> None:
    """RATE_LIMIT_REJECTIONS must accept server_slug and scope labels."""
    from app.observability.metrics import RATE_LIMIT_REJECTIONS

    for scope in ("pre_auth", "per_subject"):
        before = RATE_LIMIT_REJECTIONS.labels(
            server_slug="test-server", scope=scope
        )._value.get()
        RATE_LIMIT_REJECTIONS.labels(server_slug="test-server", scope=scope).inc()
        after = RATE_LIMIT_REJECTIONS.labels(
            server_slug="test-server", scope=scope
        )._value.get()
        assert after == before + 1.0


@pytest.mark.asyncio
async def test_rbac_denials_accepts_server_slug_label() -> None:
    """RBAC_DENIALS must accept the server_slug label."""
    from app.observability.metrics import RBAC_DENIALS

    before = RBAC_DENIALS.labels(server_slug="test-server")._value.get()
    RBAC_DENIALS.labels(server_slug="test-server").inc()
    after = RBAC_DENIALS.labels(server_slug="test-server")._value.get()

    assert after == before + 1.0


# ---------------------------------------------------------------------------
# metrics_response() helper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_metrics_response_returns_bytes_and_content_type() -> None:
    """metrics_response() must return (bytes, str) with the canonical content type."""
    from app.observability.metrics import metrics_response

    body, content_type = metrics_response()

    assert isinstance(body, bytes)
    assert isinstance(content_type, str)
    assert content_type == CONTENT_TYPE_LATEST


@pytest.mark.asyncio
async def test_metrics_response_body_is_non_empty() -> None:
    """The metrics body must contain at least one metric family."""
    from app.observability.metrics import metrics_response

    body, _ = metrics_response()

    assert len(body) > 0


@pytest.mark.asyncio
async def test_metrics_response_body_contains_known_metric_name() -> None:
    """The scrape body must include the portcullis_requests_total metric."""
    from app.observability.metrics import REQUESTS_TOTAL, metrics_response

    # Ensure the metric has been touched so it appears in the output.
    REQUESTS_TOTAL.labels(
        server_slug="sentinel", method="resources/list", status_code="404"
    ).inc()

    body, _ = metrics_response()

    assert b"portcullis_requests_total" in body


# ---------------------------------------------------------------------------
# Isolated registry — verify Counter mechanics without polluting globals
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_isolated_counter_increment() -> None:
    """A Counter in an isolated CollectorRegistry increments from zero cleanly."""
    registry = CollectorRegistry()
    counter = Counter(
        "test_isolated_counter_total",
        "Isolated counter for unit-test verification",
        ["label_a"],
        registry=registry,
    )

    counter.labels(label_a="x").inc()
    counter.labels(label_a="x").inc(3)

    assert counter.labels(label_a="x")._value.get() == 4.0


@pytest.mark.asyncio
async def test_isolated_histogram_observe() -> None:
    """A Histogram in an isolated CollectorRegistry records observations."""
    registry = CollectorRegistry()
    histogram = Histogram(
        "test_isolated_histogram_seconds",
        "Isolated histogram for unit-test verification",
        ["label_b"],
        buckets=[0.1, 0.5, 1.0],
        registry=registry,
    )

    histogram.labels(label_b="y").observe(0.3)
    histogram.labels(label_b="y").observe(0.7)

    # sum should equal 1.0
    assert histogram.labels(label_b="y")._sum.get() == pytest.approx(1.0)
