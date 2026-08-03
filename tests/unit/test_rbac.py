"""RBAC rule evaluation test boundary."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.auth.rbac import evaluate_permission
from app.models.orm import PermissionEffect, ToolPermission

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _perm(
    *,
    server_pattern: str,
    tool_pattern: str,
    effect: PermissionEffect,
    priority: int = 0,
) -> ToolPermission:
    """Build a ToolPermission ORM instance without a session."""
    p = ToolPermission(
        id=uuid4(),
        role_id=uuid4(),
        server_pattern=server_pattern,
        tool_pattern=tool_pattern,
        effect=effect,
        priority=priority,
    )
    return p


# ---------------------------------------------------------------------------
# Example-based tests
# ---------------------------------------------------------------------------


class TestExactMatch:
    def test_exact_server_and_tool_allows(self) -> None:
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="github_list_repos",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "github_list_repos", perms)
        assert decision.allowed is True
        assert decision.rule_id is not None
        assert decision.reason == "allowed by rule"

    def test_exact_match_no_allow_on_different_tool(self) -> None:
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="github_list_repos",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "github_create_issue", perms)
        assert decision.allowed is False
        assert decision.rule_id is None
        assert decision.reason == "default deny"


class TestWildcardServer:
    def test_wildcard_server_matches_any_server(self) -> None:
        perms = [
            _perm(
                server_pattern="*",
                tool_pattern="list_files",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "any-server-slug", "list_files", perms)
        assert decision.allowed is True

    def test_wildcard_server_does_not_match_wrong_tool(self) -> None:
        perms = [
            _perm(
                server_pattern="*",
                tool_pattern="list_files",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "any-server-slug", "write_file", perms)
        assert decision.allowed is False
        assert decision.rule_id is None


class TestWildcardTool:
    def test_prefix_wildcard_matches_matching_tool(self) -> None:
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="github_list_*",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "github_list_repos", perms)
        assert decision.allowed is True

    def test_prefix_wildcard_does_not_match_other_tool(self) -> None:
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="github_list_*",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "github_create_issue", perms)
        assert decision.allowed is False


class TestSpecificityBeatsWildcard:
    def test_more_specific_rule_beats_wildcard(self) -> None:
        """Exact rule denies; wildcard allows — exact wins due to higher specificity."""
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="github_list_repos",
                effect=PermissionEffect.DENY,
                priority=0,
            ),
            _perm(
                server_pattern="*",
                tool_pattern="*",
                effect=PermissionEffect.ALLOW,
                priority=0,
            ),
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "github_list_repos", perms)
        assert decision.allowed is False
        assert decision.reason == "denied by rule"

    def test_specific_allow_beats_wildcard_deny(self) -> None:
        """Exact allow wins over wildcard deny."""
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="github_list_repos",
                effect=PermissionEffect.ALLOW,
                priority=0,
            ),
            _perm(
                server_pattern="*",
                tool_pattern="*",
                effect=PermissionEffect.DENY,
                priority=0,
            ),
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "github_list_repos", perms)
        assert decision.allowed is True
        assert decision.reason == "allowed by rule"


class TestPriorityTieBreaking:
    def test_higher_priority_deny_beats_lower_priority_allow_at_same_specificity(self) -> None:
        perms = [
            _perm(
                server_pattern="server",
                tool_pattern="tool",
                effect=PermissionEffect.ALLOW,
                priority=0,
            ),
            _perm(
                server_pattern="server",
                tool_pattern="tool",
                effect=PermissionEffect.DENY,
                priority=10,
            ),
        ]
        # The deny rule has higher priority → it sits at the top tier alone
        decision = evaluate_permission(uuid4(), "server", "tool", perms)
        assert decision.allowed is False
        assert decision.reason == "denied by rule"

    def test_higher_priority_allow_beats_lower_priority_deny_at_same_specificity(self) -> None:
        perms = [
            _perm(
                server_pattern="server",
                tool_pattern="tool",
                effect=PermissionEffect.ALLOW,
                priority=10,
            ),
            _perm(
                server_pattern="server",
                tool_pattern="tool",
                effect=PermissionEffect.DENY,
                priority=0,
            ),
        ]
        # The allow rule has higher priority → it sits at the top tier alone
        decision = evaluate_permission(uuid4(), "server", "tool", perms)
        assert decision.allowed is True
        assert decision.reason == "allowed by rule"


class TestDenyTie:
    def test_deny_beats_allow_at_same_specificity_and_priority(self) -> None:
        """When allow and deny share the same specificity and priority, deny wins."""
        perms = [
            _perm(
                server_pattern="svc",
                tool_pattern="op",
                effect=PermissionEffect.ALLOW,
                priority=5,
            ),
            _perm(
                server_pattern="svc",
                tool_pattern="op",
                effect=PermissionEffect.DENY,
                priority=5,
            ),
        ]
        decision = evaluate_permission(uuid4(), "svc", "op", perms)
        assert decision.allowed is False
        assert decision.reason == "denied by rule"
        assert decision.rule_id is not None


class TestNoMatchDenial:
    def test_no_permissions_returns_default_deny(self) -> None:
        decision = evaluate_permission(uuid4(), "some-server", "some-tool", [])
        assert decision.allowed is False
        assert decision.rule_id is None
        assert decision.reason == "default deny"

    def test_unmatched_server_returns_default_deny(self) -> None:
        perms = [
            _perm(
                server_pattern="specific-server",
                tool_pattern="*",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "other-server", "any-tool", perms)
        assert decision.allowed is False
        assert decision.rule_id is None
        assert decision.reason == "default deny"


class TestMultipleRoles:
    def test_permissions_from_multiple_roles_are_all_considered(self) -> None:
        """When a subject has bindings to two roles, all their permissions apply."""
        role1_perm = _perm(
            server_pattern="server-a",
            tool_pattern="tool_a",
            effect=PermissionEffect.ALLOW,
        )
        role2_perm = _perm(
            server_pattern="server-b",
            tool_pattern="tool_b",
            effect=PermissionEffect.ALLOW,
        )
        # Both permissions are passed to evaluate_permission (repository already joined)
        decision_a = evaluate_permission(uuid4(), "server-a", "tool_a", [role1_perm, role2_perm])
        assert decision_a.allowed is True

        decision_b = evaluate_permission(uuid4(), "server-b", "tool_b", [role1_perm, role2_perm])
        assert decision_b.allowed is True

    def test_deny_from_one_role_overrides_allow_from_another_at_same_rank(self) -> None:
        allow_perm = _perm(
            server_pattern="svc",
            tool_pattern="op",
            effect=PermissionEffect.ALLOW,
            priority=0,
        )
        deny_perm = _perm(
            server_pattern="svc",
            tool_pattern="op",
            effect=PermissionEffect.DENY,
            priority=0,
        )
        decision = evaluate_permission(uuid4(), "svc", "op", [allow_perm, deny_perm])
        assert decision.allowed is False


class TestAdminNonBypass:
    def test_admin_subject_still_subject_to_rbac(self) -> None:
        """Having admin scope does NOT bypass tool RBAC — evaluate_permission is always called."""
        # Even if the caller has admin scope, if no permissions match, default deny applies.
        decision = evaluate_permission(uuid4(), "any-server", "any-tool", [])
        assert decision.allowed is False
        assert decision.reason == "default deny"

    def test_admin_subject_denied_by_explicit_deny_rule(self) -> None:
        perms = [
            _perm(
                server_pattern="restricted-server",
                tool_pattern="delete_everything",
                effect=PermissionEffect.DENY,
            )
        ]
        decision = evaluate_permission(uuid4(), "restricted-server", "delete_everything", perms)
        assert decision.allowed is False
        assert decision.reason == "denied by rule"


class TestCaseSensitivity:
    def test_uppercase_server_does_not_match_lowercase_pattern(self) -> None:
        """fnmatchcase is case-sensitive: 'GitHub_mcp' does NOT match 'github-mcp'."""
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="*",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "GitHub_mcp", "*", perms)
        assert decision.allowed is False

    def test_exact_case_match_succeeds(self) -> None:
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="list_repos",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "list_repos", perms)
        assert decision.allowed is True

    def test_case_difference_in_tool_name_no_match(self) -> None:
        perms = [
            _perm(
                server_pattern="github-mcp",
                tool_pattern="list_repos",
                effect=PermissionEffect.ALLOW,
            )
        ]
        decision = evaluate_permission(uuid4(), "github-mcp", "List_Repos", perms)
        assert decision.allowed is False


class TestDeterministicOrdering:
    def test_result_is_deterministic_for_same_inputs(self) -> None:
        """Same inputs always produce same output (no randomness in evaluation)."""
        subject_id = uuid4()
        perms = [
            _perm(
                server_pattern="svc", tool_pattern="op", effect=PermissionEffect.ALLOW, priority=5
            ),
            _perm(server_pattern="*", tool_pattern="*", effect=PermissionEffect.DENY, priority=0),
        ]
        results = [evaluate_permission(subject_id, "svc", "op", perms) for _ in range(10)]
        assert all(r.allowed == results[0].allowed for r in results)
        assert all(r.rule_id == results[0].rule_id for r in results)


# ---------------------------------------------------------------------------
# Hypothesis property tests
# ---------------------------------------------------------------------------


@given(server=st.text(min_size=1), tool=st.text(min_size=1))
def test_no_rules_always_denies(server: str, tool: str) -> None:
    """With no permissions, any server+tool combination must be denied."""
    decision = evaluate_permission(uuid4(), server, tool, [])
    assert not decision.allowed
    assert decision.rule_id is None
    assert decision.reason == "default deny"


@given(
    server=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
    tool=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
    priority=st.integers(min_value=0, max_value=100),
)
@settings(max_examples=100)
def test_deny_beats_allow_at_same_rank(server: str, tool: str, priority: int) -> None:
    """When allow and deny rules share identical specificity+priority, deny always wins."""
    allow_perm = _perm(
        server_pattern=server,
        tool_pattern=tool,
        effect=PermissionEffect.ALLOW,
        priority=priority,
    )
    deny_perm = _perm(
        server_pattern=server,
        tool_pattern=tool,
        effect=PermissionEffect.DENY,
        priority=priority,
    )
    decision = evaluate_permission(uuid4(), server, tool, [allow_perm, deny_perm])
    assert not decision.allowed
    assert decision.reason == "denied by rule"
    assert decision.rule_id is not None


@given(
    server=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
    tool=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
)
@settings(max_examples=100)
def test_allow_rule_matching_exact_string_allows(server: str, tool: str) -> None:
    """A single ALLOW rule with exact server+tool patterns always allows that combination."""
    perm = _perm(
        server_pattern=server,
        tool_pattern=tool,
        effect=PermissionEffect.ALLOW,
    )
    decision = evaluate_permission(uuid4(), server, tool, [perm])
    assert decision.allowed
    assert decision.rule_id is not None


@given(
    server=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
    tool=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
)
@settings(max_examples=100)
def test_deny_rule_matching_exact_string_denies(server: str, tool: str) -> None:
    """A single DENY rule with exact server+tool patterns always denies that combination."""
    perm = _perm(
        server_pattern=server,
        tool_pattern=tool,
        effect=PermissionEffect.DENY,
    )
    decision = evaluate_permission(uuid4(), server, tool, [perm])
    assert not decision.allowed
    assert decision.rule_id is not None
    assert decision.reason == "denied by rule"


@given(
    server=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
    tool=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
        min_size=1,
    ),
)
@settings(max_examples=50)
def test_decision_is_immutable(server: str, tool: str) -> None:
    """PermissionDecision is a frozen dataclass (immutable)."""
    perm = _perm(server_pattern=server, tool_pattern=tool, effect=PermissionEffect.ALLOW)
    decision = evaluate_permission(uuid4(), server, tool, [perm])
    with pytest.raises(AttributeError):
        decision.allowed = not decision.allowed  # type: ignore[misc]
