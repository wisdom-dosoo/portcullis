"""Integration tests for atomic Redis rate limiting against a real Redis container."""

from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import pytest

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


# ---------------------------------------------------------------------------
# Token bucket integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_token_bucket_allows_up_to_capacity(redis_client) -> None:
    """The first N=capacity requests in a burst should all be allowed."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    capacity = 5
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
        request_limit=capacity,
        window_seconds=60,
        burst_capacity=capacity,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:tb:{uuid4()}"
    now = 1_000_000.0

    results = []
    for i in range(capacity + 1):
        r = await limiter.check_token_bucket(key, policy, now=now + i * 0.001)
        results.append(r)

    allowed = [r for r in results if r.allowed]
    denied = [r for r in results if not r.allowed]
    assert len(allowed) == capacity
    assert len(denied) == 1


@pytest.mark.asyncio
async def test_token_bucket_ttl_set(redis_client) -> None:
    """Redis key TTL should be set after a token bucket check."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
        request_limit=10,
        window_seconds=60,
        burst_capacity=10,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:tb:ttl:{uuid4()}"
    await limiter.check_token_bucket(key, policy, now=1_000_000.0)
    ttl = await redis_client.ttl(key)
    assert ttl > 0


@pytest.mark.asyncio
async def test_token_bucket_refills_over_time(redis_client) -> None:
    """After consuming all tokens and waiting, new tokens should be available."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    capacity = 2
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
        request_limit=capacity,
        window_seconds=60,
        burst_capacity=capacity,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:tb:refill:{uuid4()}"
    now = 1_000_000.0

    # Exhaust the bucket
    for _ in range(capacity):
        await limiter.check_token_bucket(key, policy, now=now)

    # One more at same time should be denied
    denied = await limiter.check_token_bucket(key, policy, now=now)
    assert denied.allowed is False

    # Advance time by 60 seconds (full window): bucket refills
    refilled = await limiter.check_token_bucket(key, policy, now=now + 60)
    assert refilled.allowed is True


# ---------------------------------------------------------------------------
# Sliding window integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sliding_window_allows_up_to_limit(redis_client) -> None:
    """Exactly limit requests should be allowed, limit+1 should be denied."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    limit = 5
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=limit,
        window_seconds=60,
        burst_capacity=None,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:sw:{uuid4()}"
    now = 1_000_000.0

    results = []
    for i in range(limit + 1):
        r = await limiter.check_sliding_window(key, policy, now=now + i * 0.001)
        results.append(r)

    allowed = [r for r in results if r.allowed]
    denied = [r for r in results if not r.allowed]
    assert len(allowed) == limit
    assert len(denied) == 1


@pytest.mark.asyncio
async def test_sliding_window_ttl_set(redis_client) -> None:
    """Redis ZSET key TTL should be set after a sliding window check."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=10,
        window_seconds=60,
        burst_capacity=None,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:sw:ttl:{uuid4()}"
    await limiter.check_sliding_window(key, policy, now=1_000_000.0)
    ttl = await redis_client.ttl(key)
    assert ttl > 0


@pytest.mark.asyncio
async def test_sliding_window_old_entries_expire(redis_client) -> None:
    """Requests outside the window should not count against the limit."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    limit = 3
    window = 60
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=limit,
        window_seconds=window,
        burst_capacity=None,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:sw:expire:{uuid4()}"
    now = 1_000_000.0

    # Fill up the window
    for _ in range(limit):
        await limiter.check_sliding_window(key, policy, now=now)

    # Denied at same time
    denied = await limiter.check_sliding_window(key, policy, now=now)
    assert denied.allowed is False

    # Advance past the window: old entries should be evicted
    allowed_after = await limiter.check_sliding_window(key, policy, now=now + window + 1)
    assert allowed_after.allowed is True


# ---------------------------------------------------------------------------
# Key isolation tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_different_keys_are_isolated(redis_client) -> None:
    """Rate limit counters should not bleed between different keys."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    limit = 1
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=limit,
        window_seconds=60,
        burst_capacity=None,
    )
    limiter = RateLimiter(redis_client)
    now = 1_000_000.0

    key_a = f"test:iso:a:{uuid4()}"
    key_b = f"test:iso:b:{uuid4()}"

    r_a = await limiter.check_sliding_window(key_a, policy, now=now)
    r_b = await limiter.check_sliding_window(key_b, policy, now=now)

    assert r_a.allowed is True
    assert r_b.allowed is True  # key_b counter is independent of key_a


# ---------------------------------------------------------------------------
# Concurrency tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_token_bucket_concurrent_requests_atomic(redis_client) -> None:
    """Concurrent token bucket requests should never admit more than capacity."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    capacity = 10
    concurrent = 20
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
        request_limit=capacity,
        window_seconds=60,
        burst_capacity=capacity,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:tb:concurrent:{uuid4()}"
    now = 1_000_000.0

    tasks = [limiter.check_token_bucket(key, policy, now=now) for _ in range(concurrent)]
    results = await asyncio.gather(*tasks)

    admitted = sum(1 for r in results if r.allowed)
    assert admitted <= capacity


@pytest.mark.asyncio
async def test_sliding_window_concurrent_requests_atomic(redis_client) -> None:
    """Concurrent sliding window requests should never admit more than limit."""
    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    limit = 5
    concurrent = 15
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=limit,
        window_seconds=60,
        burst_capacity=None,
    )
    limiter = RateLimiter(redis_client)
    key = f"test:sw:concurrent:{uuid4()}"
    now = 1_000_000.0

    tasks = [limiter.check_sliding_window(key, policy, now=now) for _ in range(concurrent)]
    results = await asyncio.gather(*tasks)

    admitted = sum(1 for r in results if r.allowed)
    assert admitted <= limit


# ---------------------------------------------------------------------------
# Pre-auth IP limiting integration test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pre_auth_limit_by_ip(redis_client) -> None:
    """Pre-auth IP limiter should block after limit requests."""
    from app.limits.pre_auth import check_pre_auth_limit

    limit = 3
    window = 60
    ip = "203.0.113.42"

    # Exhaust the limit (we need to monkeypatch time or use real time)
    # Since pre_auth doesn't accept 'now', we use unique IPs per run
    ip_unique = f"{ip}:{uuid4()}"  # hack: embed uuid in IP string for isolation

    results = []
    for _ in range(limit + 1):
        # Using real time here — this works for integration tests
        r = await check_pre_auth_limit(ip_unique, redis_client, limit=limit, window=window)
        results.append(r)

    allowed = [r for r in results if r.allowed]
    denied = [r for r in results if not r.allowed]
    assert len(allowed) == limit
    assert len(denied) == 1


# ---------------------------------------------------------------------------
# Fail-closed: Redis errors propagate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redis_error_propagates() -> None:
    """If Redis is unreachable, RedisError should propagate (fail closed)."""
    import redis.exceptions
    from redis.asyncio import Redis

    from app.limits.policies import EffectivePolicy
    from app.limits.redis_bucket import RateLimiter
    from app.models.orm import RateLimitAlgorithm

    # Connect to a port with nothing listening
    bad_redis: Redis = Redis.from_url("redis://localhost:19999/0", socket_connect_timeout=0.1)
    limiter = RateLimiter(bad_redis)
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
        request_limit=10,
        window_seconds=60,
        burst_capacity=10,
    )
    with pytest.raises(redis.exceptions.RedisError):
        await limiter.check_token_bucket("k", policy, now=1_000_000.0)
    await bad_redis.aclose()
