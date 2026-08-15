"""MCP session affinity and persistence boundary.

Implements the session-tracking claims from the README: a ``Mcp-Session-Id``
issued (or echoed) by an upstream MCP server is recorded in Redis together with
the (tenant, subject, server slug) that owns it, under a sliding TTL.  Subsequent
requests carrying the same session id are validated against this mapping so that
stateful, multi-turn sessions route consistently to the same upstream and cannot
spill across tenants or identities.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)

SESSION_KEY_PREFIX = "mcp-session:"
SESSION_TTL_SECONDS = 3600


def _session_key(session_id: str) -> str:
    return f"{SESSION_KEY_PREFIX}{session_id}"


class SessionStore:
    """Redis-backed registry mapping ``Mcp-Session-Id`` to its owner and upstream."""

    def __init__(
        self,
        redis: Redis,
        ttl_seconds: int = SESSION_TTL_SECONDS,
    ) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds

    async def record(
        self,
        session_id: str,
        *,
        tenant_id: UUID,
        subject_id: str,
        server_slug: str,
    ) -> None:
        """Store or refresh the ownership mapping for a session id."""
        payload: dict[str, Any] = {
            "tenant_id": str(tenant_id),
            "subject_id": subject_id,
            "server_slug": server_slug,
        }
        await self._redis.set(
            _session_key(session_id),
            json.dumps(payload),
            ex=self._ttl_seconds,
        )

    async def lookup(self, session_id: str) -> dict[str, str] | None:
        """Resolve a session id to its ownership mapping, refreshing the TTL.

        Returns:
            The mapping dict if the session exists, otherwise None.  ``None``
            is also returned if Redis is unavailable (fail-closed) or the value
            is malformed.
        """
        try:
            raw = await self._redis.get(_session_key(session_id))
        except Exception:  # noqa: BLE001
            logger.error("session.lookup_redis_error", session_id=session_id)
            return None
        if raw is None:
            return None
        try:
            payload: dict[str, Any] = json.loads(raw)
            await self._redis.expire(_session_key(session_id), self._ttl_seconds)
            return {
                "tenant_id": str(payload["tenant_id"]),
                "subject_id": str(payload["subject_id"]),
                "server_slug": str(payload["server_slug"]),
            }
        except (ValueError, KeyError, TypeError):
            logger.warning("session.lookup_malformed", session_id=session_id)
            return None

    async def delete(self, session_id: str) -> None:
        """Remove a session id from the registry (best-effort)."""
        try:
            await self._redis.delete(_session_key(session_id))
        except Exception:  # noqa: BLE001
            logger.error("session.delete_redis_error", session_id=session_id)


def matches(
    record: dict[str, str] | None, *, tenant_id: UUID, subject_id: str, server_slug: str
) -> bool:
    """Return True when a session record belongs to the given owner and upstream."""
    if record is None:
        return False
    return (
        record["tenant_id"] == str(tenant_id)
        and record["subject_id"] == subject_id
        and record["server_slug"] == server_slug
    )
