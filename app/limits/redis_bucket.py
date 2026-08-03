"""Redis-backed rate-limit algorithm boundary."""

from __future__ import annotations

import time
from dataclasses import dataclass
from uuid import UUID

from redis.asyncio import Redis

from app.limits.policies import EffectivePolicy
from app.models.orm import RateLimitAlgorithm

# ---------------------------------------------------------------------------
# Lua scripts
# ---------------------------------------------------------------------------

# Token bucket: atomic refill + consume.
# NOTE: Lua cannot return floats to Redis (truncated to int).
# reset_after is returned as a string via tostring() to preserve precision.
_TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(data[1]) or capacity
local last_refill = tonumber(data[2]) or now

local elapsed = now - last_refill
tokens = math.min(capacity, tokens + elapsed * rate)

local allowed = 0
local remaining = math.max(0, tokens - cost)
if tokens >= cost then
    allowed = 1
    tokens = tokens - cost
end

local ttl = math.ceil(capacity / rate) + 1
redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
redis.call("EXPIRE", key, ttl)

local reset_after = (capacity - tokens) / rate
return {allowed, math.floor(remaining), tostring(reset_after)}
"""

# Sliding window: ZSET-based log of request timestamps.
# reset_after returned as string to preserve float precision.
_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = now - window

redis.call("ZREMRANGEBYSCORE", key, "-inf", window_start)
local count = redis.call("ZCARD", key)

local allowed = 0
local remaining = math.max(0, limit - count - 1)
if count < limit then
    allowed = 1
    redis.call("ZADD", key, now, tostring(now) .. math.random())
    redis.call("EXPIRE", key, window)
end

local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local reset_after = 0
if #oldest > 0 then
    reset_after = math.max(0, tonumber(oldest[2]) + window - now)
end

return {allowed, remaining, tostring(reset_after)}
"""


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RateLimitResult:
    """Typed result from a rate-limit check."""

    allowed: bool
    limit: int
    remaining: int
    reset_after_seconds: float  # seconds until window/bucket resets
    retry_after_seconds: float  # 0.0 if allowed


# ---------------------------------------------------------------------------
# Key helper
# ---------------------------------------------------------------------------


def build_key(
    tenant_id: UUID,
    subject_id: UUID,
    server_slug: str,
    tool_or_method: str,
) -> str:
    """Return the canonical Redis key for a rate-limit check."""
    return f"rl:{tenant_id}:{subject_id}:{server_slug}:{tool_or_method}"


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------


class RateLimiter:
    """Atomic Redis rate limiter using cached Lua scripts."""

    # Class-level script caches (populated lazily per Redis connection).
    _token_bucket_script: object | None = None
    _sliding_window_script: object | None = None

    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        # Register scripts (register_script is cheap; it doesn't hit the server)
        self._tb_script = redis.register_script(_TOKEN_BUCKET_LUA)
        self._sw_script = redis.register_script(_SLIDING_WINDOW_LUA)

    async def check_token_bucket(
        self,
        key: str,
        policy: EffectivePolicy,
        now: float | None = None,
    ) -> RateLimitResult:
        """Execute token-bucket Lua script and return a typed result."""
        capacity = (
            policy.burst_capacity if policy.burst_capacity is not None else policy.request_limit
        )
        rate = policy.request_limit / policy.window_seconds  # tokens/second
        now_ts = now if now is not None else time.time()
        cost = 1

        result = await self._tb_script(
            keys=[key],
            args=[str(capacity), str(rate), str(now_ts), str(cost)],
        )

        allowed_int, remaining_raw, reset_after_raw = result
        allowed = bool(int(allowed_int))
        remaining = int(remaining_raw)
        reset_after = float(reset_after_raw)
        retry_after = 0.0 if allowed else reset_after

        return RateLimitResult(
            allowed=allowed,
            limit=capacity,
            remaining=remaining,
            reset_after_seconds=reset_after,
            retry_after_seconds=retry_after,
        )

    async def check_sliding_window(
        self,
        key: str,
        policy: EffectivePolicy,
        now: float | None = None,
    ) -> RateLimitResult:
        """Execute sliding-window Lua script and return a typed result."""
        limit = policy.request_limit
        window = policy.window_seconds
        now_ts = now if now is not None else time.time()

        result = await self._sw_script(
            keys=[key],
            args=[str(limit), str(window), str(now_ts)],
        )

        allowed_int, remaining_raw, reset_after_raw = result
        allowed = bool(int(allowed_int))
        remaining = int(remaining_raw)
        reset_after = float(reset_after_raw)
        retry_after = 0.0 if allowed else reset_after

        return RateLimitResult(
            allowed=allowed,
            limit=limit,
            remaining=remaining,
            reset_after_seconds=reset_after,
            retry_after_seconds=retry_after,
        )

    async def check(
        self,
        tenant_id: UUID,
        subject_id: UUID,
        server_slug: str,
        tool_or_method: str,
        policy: EffectivePolicy,
    ) -> RateLimitResult:
        """Dispatch to the correct algorithm based on policy.algorithm.

        Raises redis.exceptions.RedisError on backend failure (caller fails closed).
        """
        key = build_key(tenant_id, subject_id, server_slug, tool_or_method)
        if policy.algorithm == RateLimitAlgorithm.TOKEN_BUCKET:
            return await self.check_token_bucket(key, policy)
        return await self.check_sliding_window(key, policy)
