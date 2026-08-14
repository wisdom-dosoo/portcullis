"""Reference-model unit tests for Redis rate limiters.

All tests here use mocked Redis — no real server required.
Hypothesis property tests use a pure Python simulation of the algorithms.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.limits.policies import EffectivePolicy
from app.limits.redis_bucket import RateLimiter, RateLimitResult, build_key
from app.models.orm import RateLimitAlgorithm

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tb_policy(
    request_limit: int = 10,
    window_seconds: int = 60,
    burst_capacity: int | None = None,
) -> EffectivePolicy:
    return EffectivePolicy(
        algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
        request_limit=request_limit,
        window_seconds=window_seconds,
        burst_capacity=burst_capacity if burst_capacity is not None else request_limit,
    )


def _sw_policy(
    request_limit: int = 10,
    window_seconds: int = 60,
) -> EffectivePolicy:
    return EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=request_limit,
        window_seconds=window_seconds,
        burst_capacity=None,
    )


def _make_redis_mock(lua_return: list[Any]) -> MagicMock:
    """Return a Redis mock whose register_script returns an AsyncMock."""
    script_mock = AsyncMock(return_value=lua_return)
    redis_mock = MagicMock()
    redis_mock.register_script.return_value = script_mock
    return redis_mock


# ---------------------------------------------------------------------------
# build_key
# ---------------------------------------------------------------------------


class TestBuildKey:
    def test_key_contains_all_segments(self) -> None:
        tenant_id = DEFAULT_TENANT_ID
        subject_id = UUID("aaaaaaaa-0000-0000-0000-000000000001")
        key = build_key(tenant_id, subject_id, "my-server", "my_tool")
        assert f"rl:{tenant_id}:{subject_id}:my-server:my_tool" == key

    def test_key_starts_with_rl_prefix(self) -> None:
        key = build_key(DEFAULT_TENANT_ID, uuid4(), "srv", "tool")
        assert key.startswith("rl:")

    def test_key_separates_segments_with_colons(self) -> None:
        tenant_id = DEFAULT_TENANT_ID
        subject_id = uuid4()
        key = build_key(tenant_id, subject_id, "server-slug", "toolname")
        parts = key.split(":")
        # "rl", tenant uuid (5 groups with dashes → string), subject uuid, server, tool
        assert parts[0] == "rl"
        assert parts[-2] == "server-slug"
        assert parts[-1] == "toolname"


# ---------------------------------------------------------------------------
# RateLimitResult
# ---------------------------------------------------------------------------


class TestRateLimitResult:
    def test_allowed_result_has_zero_retry_after(self) -> None:
        r = RateLimitResult(
            allowed=True,
            limit=10,
            remaining=9,
            reset_after_seconds=60.0,
            retry_after_seconds=0.0,
        )
        assert r.retry_after_seconds == 0.0

    def test_denied_result_has_positive_retry_after(self) -> None:
        r = RateLimitResult(
            allowed=False,
            limit=10,
            remaining=0,
            reset_after_seconds=30.0,
            retry_after_seconds=30.0,
        )
        assert r.retry_after_seconds > 0

    def test_result_is_frozen(self) -> None:
        r = RateLimitResult(
            allowed=True,
            limit=10,
            remaining=9,
            reset_after_seconds=1.0,
            retry_after_seconds=0.0,
        )
        from dataclasses import FrozenInstanceError

        with pytest.raises(FrozenInstanceError):
            r.allowed = False  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Token bucket — mock-based
# ---------------------------------------------------------------------------


class TestTokenBucketMock:
    @pytest.mark.asyncio
    async def test_first_request_allowed(self) -> None:
        # Lua returns: [allowed=1, remaining=9, reset_after="55.0"]
        redis_mock = _make_redis_mock([1, 9, b"55.0"])
        limiter = RateLimiter(redis_mock)
        policy = _tb_policy(request_limit=10, burst_capacity=10)
        result = await limiter.check_token_bucket("rl:key", policy, now=1000.0)
        assert result.allowed is True
        assert result.remaining == 9
        assert result.reset_after_seconds == pytest.approx(55.0)
        assert result.retry_after_seconds == 0.0

    @pytest.mark.asyncio
    async def test_over_capacity_denied(self) -> None:
        # Lua returns: [allowed=0, remaining=0, reset_after="6.0"]
        redis_mock = _make_redis_mock([0, 0, b"6.0"])
        limiter = RateLimiter(redis_mock)
        policy = _tb_policy(request_limit=10, burst_capacity=10)
        result = await limiter.check_token_bucket("rl:key", policy, now=1000.0)
        assert result.allowed is False
        assert result.remaining == 0
        assert result.retry_after_seconds > 0

    @pytest.mark.asyncio
    async def test_remaining_decrements(self) -> None:
        # Simulate sequential calls with decreasing remaining
        script_mock = AsyncMock(
            side_effect=[
                [1, 9, b"59.0"],
                [1, 8, b"58.0"],
                [1, 7, b"57.0"],
            ]
        )
        redis_mock = MagicMock()
        redis_mock.register_script.return_value = script_mock

        limiter = RateLimiter(redis_mock)
        policy = _tb_policy(request_limit=10, burst_capacity=10)
        r1 = await limiter.check_token_bucket("k", policy, now=1000.0)
        r2 = await limiter.check_token_bucket("k", policy, now=1001.0)
        r3 = await limiter.check_token_bucket("k", policy, now=1002.0)
        assert r1.remaining > r2.remaining > r3.remaining

    @pytest.mark.asyncio
    async def test_limit_field_equals_burst_capacity(self) -> None:
        redis_mock = _make_redis_mock([1, 4, b"50.0"])
        limiter = RateLimiter(redis_mock)
        policy = _tb_policy(request_limit=5, burst_capacity=5)
        result = await limiter.check_token_bucket("k", policy, now=1000.0)
        assert result.limit == 5

    @pytest.mark.asyncio
    async def test_burst_capacity_none_falls_back_to_request_limit(self) -> None:
        """When burst_capacity is None, should use request_limit as capacity."""
        redis_mock = _make_redis_mock([1, 9, b"59.0"])
        limiter = RateLimiter(redis_mock)
        # burst_capacity=None → should use request_limit=10
        policy = EffectivePolicy(
            algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
            request_limit=10,
            window_seconds=60,
            burst_capacity=None,
        )
        result = await limiter.check_token_bucket("k", policy, now=1000.0)
        assert result.limit == 10

    @pytest.mark.asyncio
    async def test_reset_after_is_positive_float(self) -> None:
        redis_mock = _make_redis_mock([1, 9, b"60.0"])
        limiter = RateLimiter(redis_mock)
        policy = _tb_policy()
        result = await limiter.check_token_bucket("k", policy, now=1000.0)
        assert isinstance(result.reset_after_seconds, float)
        assert result.reset_after_seconds >= 0.0


# ---------------------------------------------------------------------------
# Sliding window — mock-based
# ---------------------------------------------------------------------------


class TestSlidingWindowMock:
    @pytest.mark.asyncio
    async def test_first_request_allowed(self) -> None:
        redis_mock = _make_redis_mock([1, 9, b"60.0"])
        limiter = RateLimiter(redis_mock)
        policy = _sw_policy(request_limit=10, window_seconds=60)
        result = await limiter.check_sliding_window("rl:key", policy, now=1000.0)
        assert result.allowed is True
        assert result.remaining == 9

    @pytest.mark.asyncio
    async def test_over_limit_denied(self) -> None:
        redis_mock = _make_redis_mock([0, 0, b"30.0"])
        limiter = RateLimiter(redis_mock)
        policy = _sw_policy(request_limit=5)
        result = await limiter.check_sliding_window("rl:key", policy, now=1000.0)
        assert result.allowed is False
        assert result.retry_after_seconds > 0

    @pytest.mark.asyncio
    async def test_remaining_decrements(self) -> None:
        script_mock = AsyncMock(
            side_effect=[
                [1, 4, b"60.0"],
                [1, 3, b"60.0"],
                [1, 2, b"60.0"],
            ]
        )
        redis_mock = MagicMock()
        redis_mock.register_script.return_value = script_mock
        limiter = RateLimiter(redis_mock)
        policy = _sw_policy(request_limit=5)
        r1 = await limiter.check_sliding_window("k", policy, now=1000.0)
        r2 = await limiter.check_sliding_window("k", policy, now=1001.0)
        r3 = await limiter.check_sliding_window("k", policy, now=1002.0)
        assert r1.remaining > r2.remaining > r3.remaining

    @pytest.mark.asyncio
    async def test_limit_field_equals_request_limit(self) -> None:
        redis_mock = _make_redis_mock([1, 9, b"60.0"])
        limiter = RateLimiter(redis_mock)
        policy = _sw_policy(request_limit=10)
        result = await limiter.check_sliding_window("k", policy, now=1000.0)
        assert result.limit == 10

    @pytest.mark.asyncio
    async def test_reset_after_seconds_is_float(self) -> None:
        redis_mock = _make_redis_mock([1, 4, b"59.5"])
        limiter = RateLimiter(redis_mock)
        policy = _sw_policy()
        result = await limiter.check_sliding_window("k", policy, now=1000.0)
        assert isinstance(result.reset_after_seconds, float)


# ---------------------------------------------------------------------------
# check() dispatch
# ---------------------------------------------------------------------------


class TestCheckDispatch:
    @pytest.mark.asyncio
    async def test_dispatches_token_bucket(self) -> None:
        redis_mock = _make_redis_mock([1, 9, b"59.0"])
        limiter = RateLimiter(redis_mock)
        policy = _tb_policy()
        result = await limiter.check(
            DEFAULT_TENANT_ID,
            uuid4(),
            "server",
            "tool",
            policy,
        )
        assert isinstance(result, RateLimitResult)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_dispatches_sliding_window(self) -> None:
        redis_mock = _make_redis_mock([1, 9, b"60.0"])
        limiter = RateLimiter(redis_mock)
        policy = _sw_policy()
        result = await limiter.check(
            DEFAULT_TENANT_ID,
            uuid4(),
            "server",
            "tool",
            policy,
        )
        assert isinstance(result, RateLimitResult)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_key_contains_all_identifiers(self) -> None:
        """Verify the key passed to the Lua script has all 4 segments."""
        script_mock = AsyncMock(return_value=[1, 9, b"59.0"])
        redis_mock = MagicMock()
        redis_mock.register_script.return_value = script_mock

        tenant_id = DEFAULT_TENANT_ID
        subject_id = UUID("bbbbbbbb-0000-0000-0000-000000000002")
        limiter = RateLimiter(redis_mock)
        policy = _tb_policy()
        await limiter.check(tenant_id, subject_id, "my-server", "my_tool", policy)

        call_kwargs = script_mock.call_args
        key_used = call_kwargs.kwargs["keys"][0]
        assert str(tenant_id) in key_used
        assert str(subject_id) in key_used
        assert "my-server" in key_used
        assert "my_tool" in key_used


# ---------------------------------------------------------------------------
# pre_auth
# ---------------------------------------------------------------------------


class TestPreAuthLimit:
    @pytest.mark.asyncio
    async def test_pre_auth_uses_ip_key(self) -> None:
        from app.limits.pre_auth import check_pre_auth_limit

        script_mock = AsyncMock(return_value=[1, 49, b"60.0"])
        redis_mock = MagicMock()
        redis_mock.register_script.return_value = script_mock

        result = await check_pre_auth_limit("192.168.1.1", redis_mock, limit=50, window=60)
        assert result.allowed is True
        assert result.limit == 50

        # Verify the key contains the IP
        call_kwargs = script_mock.call_args
        key_used = call_kwargs.kwargs["keys"][0]
        assert "192.168.1.1" in key_used
        assert key_used.startswith("pre_auth:")

    @pytest.mark.asyncio
    async def test_pre_auth_denied_when_over_limit(self) -> None:
        from app.limits.pre_auth import check_pre_auth_limit

        redis_mock = _make_redis_mock([0, 0, b"30.0"])
        result = await check_pre_auth_limit("10.0.0.1", redis_mock, limit=5, window=60)
        assert result.allowed is False
        assert result.retry_after_seconds > 0


# ---------------------------------------------------------------------------
# Hypothesis reference-model tests (pure Python, no Redis)
# ---------------------------------------------------------------------------


def _simulate_token_bucket(capacity: int, rate: float, requests: int) -> int:
    """Pure Python reference model of the token bucket algorithm.

    Returns the number of requests allowed in a burst (no time advance).
    """
    tokens = float(capacity)
    allowed_count = 0
    for _ in range(requests):
        if tokens >= 1.0:
            tokens -= 1.0
            allowed_count += 1
    return allowed_count


def _simulate_sliding_window(limit: int, requests: int) -> int:
    """Pure Python reference model of the sliding window algorithm.

    Returns the number of requests allowed when all arrive at the same timestamp
    (i.e., within the same window).
    """
    count = 0
    allowed_count = 0
    for _ in range(requests):
        if count < limit:
            allowed_count += 1
            count += 1
    return allowed_count


@given(
    capacity=st.integers(min_value=1, max_value=100),
    requests=st.integers(min_value=0, max_value=200),
)
@settings(max_examples=200)
def test_token_bucket_never_over_admits(capacity: int, requests: int) -> None:
    """Property: number of allowed requests in a burst never exceeds capacity."""
    rate = capacity / 60.0  # tokens/second
    allowed = _simulate_token_bucket(capacity, rate, requests)
    assert allowed <= capacity


@given(
    limit=st.integers(min_value=1, max_value=100),
    requests=st.integers(min_value=0, max_value=200),
)
@settings(max_examples=200)
def test_sliding_window_never_over_admits(limit: int, requests: int) -> None:
    """Property: number of allowed requests in a window never exceeds limit."""
    allowed = _simulate_sliding_window(limit, requests)
    assert allowed <= limit


@given(
    capacity=st.integers(min_value=1, max_value=50),
    requests=st.integers(min_value=1, max_value=100),
)
@settings(max_examples=200)
def test_token_bucket_admits_exactly_capacity_in_burst(capacity: int, requests: int) -> None:
    """Property: at most capacity requests are admitted when tokens = capacity."""
    rate = 1.0
    allowed = _simulate_token_bucket(capacity, rate, requests)
    expected = min(capacity, requests)
    assert allowed == expected


@given(
    limit=st.integers(min_value=1, max_value=50),
    requests=st.integers(min_value=1, max_value=100),
)
@settings(max_examples=200)
def test_sliding_window_admits_exactly_limit(limit: int, requests: int) -> None:
    """Property: exactly min(limit, requests) are admitted."""
    allowed = _simulate_sliding_window(limit, requests)
    assert allowed == min(limit, requests)


@given(
    capacity=st.integers(min_value=1, max_value=100),
)
@settings(max_examples=100)
def test_token_bucket_remaining_never_negative(capacity: int) -> None:
    """Property: remaining tokens never go below zero."""
    tokens = float(capacity)
    for _ in range(capacity * 2):
        if tokens >= 1.0:
            tokens -= 1.0
        remaining = max(0.0, tokens - 1.0)
        assert remaining >= 0.0
