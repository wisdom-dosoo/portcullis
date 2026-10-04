"""OAuth bearer token and JWKS validation boundary."""

from __future__ import annotations

import asyncio
import json
import time

import httpx
import structlog
from authlib.jose import JsonWebKey
from authlib.jose import jwt as jose_jwt
from redis.asyncio import Redis

from app.auth.subject import Subject
from app.config import Settings
from app.models.orm import SubjectType

logger = structlog.get_logger(__name__)

# Redis key prefix for JWKS cache (P3: per-URL keys — the old single-slot
# `jwks:cache` thrashed in multi-IdP deployments).
_JWKS_CACHE_PREFIX = "jwks:cache:"
_JWKS_LOCK_PREFIX = "jwks:lock:"
_JWKS_CHANNEL = "jwks:invalidate"


def _jwks_key(url: str) -> str:
    import hashlib as _hashlib

    digest = _hashlib.sha256(url.encode()).hexdigest()[:16]
    return f"{_JWKS_CACHE_PREFIX}{digest}"


def _jwks_lock_key(url: str) -> str:
    import hashlib as _hashlib

    digest = _hashlib.sha256(url.encode()).hexdigest()[:16]
    return f"{_JWKS_LOCK_PREFIX}{digest}"


class JwksCache:
    """Redis-backed JWKS cache with TTL and pubsub invalidation.

    Provides distributed cache coherence across multiple gateway workers.
    """

    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds
        self._pubsub: Redis | None = None
        self._listener_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Start the pubsub listener for cache invalidation."""
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(_JWKS_CHANNEL)
        self._listener_task = asyncio.create_task(self._listen_for_invalidation())

    async def stop(self) -> None:
        """Stop the pubsub listener."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._pubsub:
            await self._pubsub.unsubscribe(_JWKS_CHANNEL)
            await self._pubsub.aclose()

    async def _listen_for_invalidation(self) -> None:
        """Listen for invalidation messages and clear local cache."""
        if not self._pubsub:
            return
        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    logger.debug("jwks.invalidation_received")
                    # P3: per-URL keys — clear the whole prefix pattern.
                    try:
                        async for key in self._redis.scan_iter(f"{_JWKS_CACHE_PREFIX}*"):
                            await self._redis.delete(key)
                    except Exception:  # noqa: BLE001
                        pass
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: BLE001
            logger.error("jwks.pubsub_listener_error")

    async def get(self, jwks_url: str) -> dict:
        """Get JWKS from cache or fetch from URL (P3: per-URL keys).

        Uses a distributed lock to prevent thundering herd on cache miss.
        """
        cache_key = _jwks_key(jwks_url)
        lock_key = _jwks_lock_key(jwks_url)
        # Try to get from cache first
        cached = await self._redis.get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                if data.get("url") == jwks_url:
                    return data["keys"]
            except (json.JSONDecodeError, KeyError):
                pass  # Fall through to fetch

        # Cache miss or URL changed - acquire lock and fetch
        lock = self._redis.lock(lock_key, timeout=10, blocking_timeout=5)
        acquired = await lock.acquire()
        try:
            if acquired:
                # Double-check after acquiring lock
                cached = await self._redis.get(cache_key)
                if cached:
                    try:
                        data = json.loads(cached)
                        if data.get("url") == jwks_url:
                            return data["keys"]
                    except (json.JSONDecodeError, KeyError):
                        pass

                # Fetch fresh JWKS
                jwks_data = await _fetch_jwks(jwks_url)
                payload = {"url": jwks_url, "keys": jwks_data}
                await self._redis.set(
                    cache_key,
                    json.dumps(payload),
                    ex=self._ttl_seconds,
                )
                return jwks_data
            else:
                # Could not acquire lock - wait a bit and retry once
                await asyncio.sleep(0.1)
                cached = await self._redis.get(cache_key)
                if cached:
                    try:
                        data = json.loads(cached)
                        if data.get("url") == jwks_url:
                            return data["keys"]
                    except (json.JSONDecodeError, KeyError):
                        pass
                # Last resort: fetch without caching (avoid blocking)
                return await _fetch_jwks(jwks_url)
        finally:
            if acquired:
                try:
                    await lock.release()
                except Exception as exc:  # noqa: BLE001
                    logger.debug("jwks.lock_release_failed", error=str(exc))

    async def invalidate(self, jwks_url: str | None = None) -> None:
        """Invalidate one URL (or all) and publish the invalidation event."""
        if jwks_url is not None:
            await self._redis.delete(_jwks_key(jwks_url))
        else:
            try:
                async for key in self._redis.scan_iter(f"{_JWKS_CACHE_PREFIX}*"):
                    await self._redis.delete(key)
            except Exception:  # noqa: BLE001
                pass
        await self._redis.publish(_JWKS_CHANNEL, "invalidate")


async def _fetch_jwks(url: str, client: httpx.AsyncClient | None = None) -> dict:
    """Fetch the JWKS document with a bounded timeout (P3: no hangs).

    Uses the shared runtime client when available; otherwise a fresh client
    with a 10s timeout (was unbounded — a hanging IdP stalled auth).
    """
    try:
        if client is not None:
            response = await client.get(url, timeout=10.0)
        else:
            async with httpx.AsyncClient(timeout=10.0) as fresh:
                response = await fresh.get(url)
        response.raise_for_status()
        return response.json()
    except Exception:  # noqa: BLE001 - convert any failure to a uniform opaque error
        raise ValueError("invalid bearer token")


async def verify_jwt(
    raw_token: str, settings: Settings, jwks_cache: JwksCache | None = None
) -> Subject:
    """Verify a raw JWT bearer token against the configured JWKS endpoint.

    Args:
        raw_token: The raw JWT string (without "Bearer " prefix).
        settings: The application settings instance.
        jwks_cache: Optional JWKS cache instance. If not provided, uses a
            temporary in-memory cache (for backward compatibility in tests).

    Returns:
        An authenticated Subject carrying the JWT ``sub`` claim and scopes.

    Raises:
        ValueError: If JWT auth is not configured (no ``jwt_jwks_url``).
        ValueError: On any validation failure — bad format, expired token,
            wrong audience/issuer, missing sub, or JWKS fetch error.
    """
    if settings.jwt_jwks_url is None:
        raise ValueError("JWT auth is not configured")

    try:
        if jwks_cache is not None:
            jwks_data = await jwks_cache.get(settings.jwt_jwks_url)
        else:
            # Fallback to in-memory cache for tests/backward compat
            jwks_data = await _get_jwks_legacy(settings)

        jwks = JsonWebKey.import_key_set(jwks_data)

        claims_options: dict[str, object] = {
            "exp": {"essential": True},
        }
        if settings.jwt_audience:
            claims_options["aud"] = {"essential": True, "values": [settings.jwt_audience]}
        if settings.jwt_issuer:
            claims_options["iss"] = {"essential": True, "value": settings.jwt_issuer}

        payload = jose_jwt.decode(raw_token, jwks, claims_options=claims_options)
        payload.validate()

        sub = payload.get("sub")
        if not sub:
            raise ValueError("invalid bearer token")

        scope_str = payload.get("scope", "")
        scopes = frozenset(scope_str.split()) if scope_str else frozenset()

        # Tenant claim mapping for multi-tenant OIDC (open source: no billing, but org isolation)
        # Supports: tenant_id, tenantId, org_id, orgId, tid, and namespaced claim
        # P0: fail closed. Previously an invalid/missing claim silently fell back
        # to DEFAULT_TENANT_ID, collapsing all IdP users into one tenant.
        tenant_claim_keys = [
            "tenant_id",
            "tenantId",
            "org_id",
            "orgId",
            "tid",
            "https://portcullis/tenant",
            "https://portcullis.io/tenant",
            settings.jwt_audience + "/tenant" if settings.jwt_audience else None,
        ]
        tenant_id = None
        tenant_claim_present = False
        for key in tenant_claim_keys:
            if not key:
                continue
            raw_tid = payload.get(key)
            if raw_tid:
                tenant_claim_present = True
                try:
                    import uuid as _uuid

                    tenant_id = _uuid.UUID(str(raw_tid))
                    break
                except Exception:
                    # Invalid UUID in claim — fail closed, do not default.
                    raise ValueError("invalid bearer token")
        if tenant_id is None:
            if tenant_claim_present:
                raise ValueError("invalid bearer token")
            # No tenant claim from IdP: use default tenant explicitly (single-tenant
            # self-host). Multi-tenant deployments must configure the claim.
            from app.constants import DEFAULT_TENANT_ID as _DEFAULT

            tenant_id = _DEFAULT

        return Subject(
            subject_id=sub,
            subject_type=SubjectType.OAUTH_SUBJECT,
            tenant_id=tenant_id,
            scopes=scopes,
        )
    except ValueError as exc:
        # Normalize all ValueErrors to a single safe message, except for errors
        # we already raised ourselves (JWT auth not configured, missing sub).
        if str(exc) in {"invalid bearer token", "JWT auth is not configured"}:
            raise
        raise ValueError("invalid bearer token") from exc
    except Exception:  # noqa: BLE001 - sign decode/serialization failures uniformly
        raise ValueError("invalid bearer token")


# Legacy in-memory cache for backward compatibility (tests)
_jwks_cache: dict[str, object] = {}
_jwks_lock = asyncio.Lock()


async def _get_jwks_legacy(settings: Settings) -> dict:
    """Return cached JWKS or fetch fresh ones if the cache has expired (legacy in-memory)."""
    async with _jwks_lock:
        now = time.monotonic()
        fetched_at = _jwks_cache.get("fetched_at")
        if fetched_at is None or (now - fetched_at) >= settings.jwt_jwks_cache_ttl_seconds:
            jwks_data = await _fetch_jwks(settings.jwt_jwks_url)
            _jwks_cache["keys"] = jwks_data
            _jwks_cache["fetched_at"] = now

    return _jwks_cache["keys"]


def _reset_cache() -> None:
    """Clear the legacy in-memory JWKS cache. Intended for use in tests only."""
    _jwks_cache.clear()
