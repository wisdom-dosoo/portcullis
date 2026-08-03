"""Role-based tool authorization boundary."""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass
from uuid import UUID

from app.models.orm import PermissionEffect, ToolPermission


@dataclass(frozen=True)
class PermissionDecision:
    """Immutable result of a permission evaluation."""

    allowed: bool
    rule_id: UUID | None  # None if default-deny
    reason: str


def _pattern_specificity(pattern: str) -> int:
    """Count literal characters (non-wildcard) as specificity score.

    Wildcard characters ``*``, ``?``, ``[``, ``]`` do not contribute to
    specificity — only literal characters do.
    """
    return sum(1 for ch in pattern if ch not in ("*", "?", "[", "]"))


def evaluate_permission(
    subject_id: UUID,
    server_slug: str,
    tool_name: str,
    permissions: list[ToolPermission],
) -> PermissionDecision:
    """Evaluate whether a subject may invoke *tool_name* on *server_slug*.

    The ``subject_id`` parameter is accepted for interface consistency with
    the repository layer but is not used during pattern matching — the caller
    is responsible for fetching the permissions that already belong to the
    subject before calling this function.

    Algorithm
    ---------
    1. Filter to rules where both server and tool patterns match
       (case-sensitive via :func:`fnmatch.fnmatchcase`).
    2. Score each matching rule by specificity
       (``_pattern_specificity(server_pattern) + _pattern_specificity(tool_pattern)``).
    3. Prefer rules with the highest specificity; among ties, prefer highest
       ``priority``.  The *top-ranked set* is all rules sharing the same
       ``(specificity, priority)`` as the first element after sorting by
       ``(-specificity, -priority)``.
    4. If any DENY rule exists in the top-ranked set → DENY wins.
    5. If the top-ranked set is all ALLOW → ALLOW.
    6. If no rules match → default deny.
    """
    # Step 1: filter matching rules (case-sensitive).
    matching: list[ToolPermission] = [
        rule
        for rule in permissions
        if fnmatch.fnmatchcase(server_slug, rule.server_pattern)
        and fnmatch.fnmatchcase(tool_name, rule.tool_pattern)
    ]

    if not matching:
        return PermissionDecision(allowed=False, rule_id=None, reason="default deny")

    # Step 2 & 3: sort by (-specificity, -priority) and find top-ranked set.
    def _rank_key(rule: ToolPermission) -> tuple[int, int]:
        specificity = _pattern_specificity(rule.server_pattern) + _pattern_specificity(
            rule.tool_pattern
        )
        return (-specificity, -rule.priority)

    matching.sort(key=_rank_key)
    top_key = _rank_key(matching[0])
    top_set = [rule for rule in matching if _rank_key(rule) == top_key]

    # Step 4: deny wins if any DENY in top-ranked set.
    deny_rules = [rule for rule in top_set if rule.effect == PermissionEffect.DENY]
    if deny_rules:
        return PermissionDecision(
            allowed=False,
            rule_id=deny_rules[0].id,
            reason="denied by rule",
        )

    # Step 5: all rules in top-ranked set are ALLOW.
    return PermissionDecision(
        allowed=True,
        rule_id=top_set[0].id,
        reason="allowed by rule",
    )
