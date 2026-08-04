"""Unit tests for rate-limit policy resolution."""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from app.limits.policies import EffectivePolicy, parse_default, resolve_policy
from app.models.orm import RateLimitAlgorithm

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_policy(
    *,
    subject_id: UUID | None = None,
    server_pattern: str | None = None,
    tool_pattern: str | None = None,
    algorithm: RateLimitAlgorithm = RateLimitAlgorithm.SLIDING_WINDOW,
    request_limit: int = 100,
    window_seconds: int = 60,
    burst_capacity: int | None = None,
    priority: int = 0,
) -> MagicMock:
    policy = MagicMock()
    policy.id = uuid4()
    policy.tenant_id = DEFAULT_TENANT_ID
    policy.subject_id = subject_id
    policy.server_pattern = server_pattern
    policy.tool_pattern = tool_pattern
    policy.algorithm = algorithm
    policy.request_limit = request_limit
    policy.window_seconds = window_seconds
    policy.burst_capacity = burst_capacity
    policy.priority = priority
    return policy


# ---------------------------------------------------------------------------
# parse_default
# ---------------------------------------------------------------------------


class TestParseDefault:
    def test_parse_100_per_minute(self) -> None:
        count, seconds = parse_default("100/minute")
        assert count == 100
        assert seconds == 60

    def test_parse_1_per_day(self) -> None:
        count, seconds = parse_default("1/day")
        assert count == 1
        assert seconds == 86400

    def test_parse_50_per_second(self) -> None:
        count, seconds = parse_default("50/second")
        assert count == 50
        assert seconds == 1

    def test_parse_200_per_hour(self) -> None:
        count, seconds = parse_default("200/hour")
        assert count == 200
        assert seconds == 3600


# ---------------------------------------------------------------------------
# resolve_policy — default fallback
# ---------------------------------------------------------------------------


class TestResolveDefault:
    def test_returns_default_when_no_policies(self) -> None:
        result = resolve_policy(
            subject_id=None,
            server_slug=None,
            tool_name=None,
            policies=[],
            default_str="100/minute",
        )
        assert isinstance(result, EffectivePolicy)
        assert result.request_limit == 100
        assert result.window_seconds == 60
        assert result.algorithm == RateLimitAlgorithm.TOKEN_BUCKET
        assert result.burst_capacity == 100

    def test_default_burst_equals_request_limit(self) -> None:
        result = resolve_policy(
            subject_id=None,
            server_slug="my-server",
            tool_name="my_tool",
            policies=[],
            default_str="50/second",
        )
        assert result.request_limit == 50
        assert result.burst_capacity == 50

    def test_returns_default_when_no_policies_match(self) -> None:
        subject_id = uuid4()
        policy = _make_policy(subject_id=uuid4())  # different subject
        result = resolve_policy(
            subject_id=subject_id,
            server_slug=None,
            tool_name=None,
            policies=[policy],
            default_str="100/minute",
        )
        assert result.request_limit == 100
        assert result.algorithm == RateLimitAlgorithm.TOKEN_BUCKET


# ---------------------------------------------------------------------------
# resolve_policy — selector hierarchy
# ---------------------------------------------------------------------------


class TestSelectorHierarchy:
    def test_subject_server_tool_beats_subject_server(self) -> None:
        subject_id = uuid4()
        # Level 1: subject + server
        p_level1 = _make_policy(
            subject_id=subject_id,
            server_pattern="my-server",
            request_limit=50,
        )
        # Level 0: subject + server + tool
        p_level0 = _make_policy(
            subject_id=subject_id,
            server_pattern="my-server",
            tool_pattern="my_tool",
            request_limit=10,
        )
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="my-server",
            tool_name="my_tool",
            policies=[p_level1, p_level0],
            default_str="100/minute",
        )
        assert result.request_limit == 10

    def test_subject_server_beats_subject_only(self) -> None:
        subject_id = uuid4()
        # Level 2: subject only
        p_level2 = _make_policy(subject_id=subject_id, request_limit=200)
        # Level 1: subject + server
        p_level1 = _make_policy(
            subject_id=subject_id,
            server_pattern="my-server",
            request_limit=50,
        )
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="my-server",
            tool_name="my_tool",
            policies=[p_level2, p_level1],
            default_str="100/minute",
        )
        assert result.request_limit == 50

    def test_subject_only_beats_default(self) -> None:
        subject_id = uuid4()
        p_subject = _make_policy(subject_id=subject_id, request_limit=30)
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="my-server",
            tool_name="my_tool",
            policies=[p_subject],
            default_str="100/minute",
        )
        assert result.request_limit == 30

    def test_full_hierarchy_ordering(self) -> None:
        subject_id = uuid4()
        p_subject = _make_policy(subject_id=subject_id, request_limit=200)
        p_subject_server = _make_policy(
            subject_id=subject_id, server_pattern="srv", request_limit=150
        )
        p_subject_server_tool = _make_policy(
            subject_id=subject_id,
            server_pattern="srv",
            tool_pattern="tool",
            request_limit=10,
        )
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="srv",
            tool_name="tool",
            policies=[p_subject, p_subject_server, p_subject_server_tool],
            default_str="100/minute",
        )
        assert result.request_limit == 10


# ---------------------------------------------------------------------------
# resolve_policy — priority tie-breaking
# ---------------------------------------------------------------------------


class TestPriorityTieBreaking:
    def test_higher_priority_wins_at_same_level(self) -> None:
        subject_id = uuid4()
        p_low = _make_policy(subject_id=subject_id, request_limit=100, priority=0)
        p_high = _make_policy(subject_id=subject_id, request_limit=20, priority=10)
        result = resolve_policy(
            subject_id=subject_id,
            server_slug=None,
            tool_name=None,
            policies=[p_low, p_high],
            default_str="999/minute",
        )
        assert result.request_limit == 20

    def test_higher_priority_wins_within_subject_server_level(self) -> None:
        subject_id = uuid4()
        p_low = _make_policy(
            subject_id=subject_id, server_pattern="srv", request_limit=100, priority=0
        )
        p_high = _make_policy(
            subject_id=subject_id, server_pattern="srv", request_limit=5, priority=99
        )
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="srv",
            tool_name=None,
            policies=[p_low, p_high],
            default_str="999/minute",
        )
        assert result.request_limit == 5


# ---------------------------------------------------------------------------
# resolve_policy — pattern specificity tie-breaking
# ---------------------------------------------------------------------------


class TestPatternSpecificity:
    def test_more_specific_server_pattern_wins_same_priority(self) -> None:
        subject_id = uuid4()
        # Wildcard server pattern (low specificity)
        p_wildcard = _make_policy(
            subject_id=subject_id,
            server_pattern="*",
            tool_pattern="my_tool",
            request_limit=100,
            priority=0,
        )
        # Exact server pattern (high specificity)
        p_exact = _make_policy(
            subject_id=subject_id,
            server_pattern="my-server",
            tool_pattern="my_tool",
            request_limit=10,
            priority=0,
        )
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="my-server",
            tool_name="my_tool",
            policies=[p_wildcard, p_exact],
            default_str="999/minute",
        )
        assert result.request_limit == 10


# ---------------------------------------------------------------------------
# resolve_policy — pattern matching
# ---------------------------------------------------------------------------


class TestPatternMatching:
    def test_fnmatch_wildcard_server_pattern(self) -> None:
        subject_id = uuid4()
        p = _make_policy(subject_id=subject_id, server_pattern="srv-*", request_limit=42)
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="srv-production",
            tool_name=None,
            policies=[p],
            default_str="100/minute",
        )
        assert result.request_limit == 42

    def test_non_matching_server_pattern_falls_to_default(self) -> None:
        subject_id = uuid4()
        p = _make_policy(subject_id=subject_id, server_pattern="other-server", request_limit=42)
        result = resolve_policy(
            subject_id=subject_id,
            server_slug="my-server",
            tool_name=None,
            policies=[p],
            default_str="100/minute",
        )
        assert result.request_limit == 100

    def test_subject_mismatch_falls_to_default(self) -> None:
        subject_id = uuid4()
        other_subject = uuid4()
        p = _make_policy(subject_id=other_subject, request_limit=42)
        result = resolve_policy(
            subject_id=subject_id,
            server_slug=None,
            tool_name=None,
            policies=[p],
            default_str="100/minute",
        )
        assert result.request_limit == 100

    def test_no_server_context_when_policy_requires_server(self) -> None:
        subject_id = uuid4()
        p = _make_policy(subject_id=subject_id, server_pattern="my-server", request_limit=42)
        # server_slug is None, so this policy should NOT match
        result = resolve_policy(
            subject_id=subject_id,
            server_slug=None,
            tool_name=None,
            policies=[p],
            default_str="100/minute",
        )
        assert result.request_limit == 100


# ---------------------------------------------------------------------------
# resolve_policy — EffectivePolicy contents
# ---------------------------------------------------------------------------


class TestEffectivePolicyContents:
    def test_algorithm_and_burst_propagated(self) -> None:
        subject_id = uuid4()
        p = _make_policy(
            subject_id=subject_id,
            algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
            request_limit=50,
            window_seconds=30,
            burst_capacity=75,
        )
        result = resolve_policy(
            subject_id=subject_id,
            server_slug=None,
            tool_name=None,
            policies=[p],
            default_str="100/minute",
        )
        assert result.algorithm == RateLimitAlgorithm.TOKEN_BUCKET
        assert result.request_limit == 50
        assert result.window_seconds == 30
        assert result.burst_capacity == 75

    def test_effective_policy_is_frozen(self) -> None:
        result = resolve_policy(
            subject_id=None,
            server_slug=None,
            tool_name=None,
            policies=[],
            default_str="10/second",
        )
        with pytest.raises(AttributeError):
            result.request_limit = 999  # type: ignore[misc]
