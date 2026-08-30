"""Effective rate-limit policy resolution boundary."""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass

from app.auth.rbac import _pattern_specificity
from app.models.orm import RateLimitAlgorithm, RateLimitPolicy

UNIT_SECONDS: dict[str, int] = {
    "second": 1,
    "minute": 60,
    "hour": 3600,
    "day": 86400,
}


@dataclass(frozen=True)
class EffectivePolicy:
    """Immutable result of policy resolution — drives the rate limiter."""

    algorithm: RateLimitAlgorithm
    request_limit: int
    window_seconds: int
    burst_capacity: int | None


def parse_default(default_str: str) -> tuple[int, int]:
    """Parse '100/minute' → (100, 60).  Supports second/minute/hour/day."""
    count_str, unit = default_str.split("/", 1)
    return int(count_str), UNIT_SECONDS[unit]


def _selector_level(policy: RateLimitPolicy) -> int:
    """Return the discrete selector level for a policy (lower = more specific).

    0 — subject + server + tool (all three selectors non-null)
    1 — subject + server   (tool_pattern is null)
    2 — subject only       (server_pattern and tool_pattern both null)
    3 — global             (subject_id is null)
    """
    has_subject = policy.subject_id is not None
    has_server = policy.server_pattern is not None
    has_tool = policy.tool_pattern is not None

    if has_subject and has_server and has_tool:
        return 0
    if has_subject and has_server and not has_tool:
        return 1
    if has_subject and not has_server and not has_tool:
        return 2
    # Global policy (no subject)
    return 3


def _policy_matches(
    policy: RateLimitPolicy,
    subject_id: str | None,
    subject_type: SubjectType | None,
    server_slug: str | None,
    tool_name: str | None,
) -> bool:
    """Return True if the policy applies to the given request context."""
    # Subject must match if policy is subject-scoped.
    if policy.subject_id is not None:
        if subject_id is None or policy.subject_id != subject_id:
            return False
        if policy.subject_type is not None and subject_type is not None:
            if policy.subject_type != subject_type:
                return False

    # Server pattern must match if policy specifies one
    if policy.server_pattern is not None:
        if server_slug is None:
            return False
        if not fnmatch.fnmatchcase(server_slug, policy.server_pattern):
            return False

    # Tool pattern must match if policy specifies one
    if policy.tool_pattern is not None:
        if tool_name is None:
            return False
        if not fnmatch.fnmatchcase(tool_name, policy.tool_pattern):
            return False

    return True


def resolve_policy(
    subject_id: str | None,
    subject_type: SubjectType | None,
    server_slug: str | None,
    tool_name: str | None,
    policies: list[RateLimitPolicy],
    default_str: str,
) -> EffectivePolicy:
    """Find the most specific applicable policy.

    Selector hierarchy (most-specific first):
    0. subject + server + tool (all three non-null match)
    1. subject + server (subject and server match, tool_pattern is null)
    2. subject only (subject matches, server_pattern and tool_pattern null)
    3. global (no subject_id)

    Within same selector level: highest priority wins.
    Within same priority: highest pattern specificity (_pattern_specificity) wins.
    Falls back to the default_str (parsed as token_bucket) if no policies match.
    """
    # Filter to only matching policies
    candidates = [
        p for p in policies if _policy_matches(p, subject_id, subject_type, server_slug, tool_name)
    ]

    if not candidates:
        request_limit, window_seconds = parse_default(default_str)
        return EffectivePolicy(
            algorithm=RateLimitAlgorithm.TOKEN_BUCKET,
            request_limit=request_limit,
            window_seconds=window_seconds,
            burst_capacity=request_limit,
        )

    def _rank_key(policy: RateLimitPolicy) -> tuple[int, int, int]:
        specificity = _pattern_specificity(policy.server_pattern or "") + _pattern_specificity(
            policy.tool_pattern or ""
        )
        return (_selector_level(policy), -policy.priority, -specificity)

    candidates.sort(key=_rank_key)
    best = candidates[0]

    return EffectivePolicy(
        algorithm=best.algorithm,
        request_limit=best.request_limit,
        window_seconds=best.window_seconds,
        burst_capacity=best.burst_capacity,
    )
