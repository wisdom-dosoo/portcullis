"""Pre-authentication IP-based rate-limit boundary."""

from __future__ import annotations

from redis.asyncio import Redis

from app.limits.policies import EffectivePolicy
from app.limits.redis_bucket import RateLimiter, RateLimitResult
from app.models.orm import RateLimitAlgorithm


async def check_pre_auth_limit(
    client_ip: str,
    redis: Redis,
    limit: int,
    window: int,
) -> RateLimitResult:
    """Sliding-window rate limit keyed by IP for unauthenticated requests.

    Args:
        client_ip: The client's IP address (used as the Redis key suffix).
        redis:     Async Redis connection.
        limit:     Maximum requests per window.
        window:    Window size in seconds.

    Returns:
        RateLimitResult describing whether the request is allowed.

    Raises:
        redis.exceptions.RedisError: On backend failure — caller must fail closed.
    """
    policy = EffectivePolicy(
        algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
        request_limit=limit,
        window_seconds=window,
        burst_capacity=None,
    )
    key = f"pre_auth:{client_ip}"
    limiter = RateLimiter(redis)
    return await limiter.check_sliding_window(key, policy)
