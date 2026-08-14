"""Unit tests for the tool filter boundary."""

from __future__ import annotations

import copy
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest

from app.auth.subject import Subject
from app.auth.tool_filter import filter_tools_list
from app.models.orm import PermissionEffect, ToolPermission

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


def _make_subject(subject_id: str | None = None) -> Subject:
    from app.models.orm import SubjectType

    return Subject(
        subject_id=subject_id or str(uuid4()),
        subject_type=SubjectType.API_KEY,
        tenant_id=DEFAULT_TENANT_ID,
        scopes=frozenset(["admin"]),
    )


def _make_perm(
    *,
    server_pattern: str,
    tool_pattern: str,
    effect: PermissionEffect,
    priority: int = 0,
) -> ToolPermission:
    p = ToolPermission(
        id=uuid4(),
        role_id=uuid4(),
        server_pattern=server_pattern,
        tool_pattern=tool_pattern,
        effect=effect,
        priority=priority,
    )
    return p


def _make_tools_response(tool_names: list[str], jsonrpc_id: int | str = 1) -> dict:
    """Build a mock tools/list JSON-RPC response."""
    return {
        "jsonrpc": "2.0",
        "id": jsonrpc_id,
        "result": {
            "tools": [{"name": name, "description": f"desc for {name}"} for name in tool_names],
            "_meta": {"some": "metadata"},
        },
    }


# ---------------------------------------------------------------------------
# All tools allowed
# ---------------------------------------------------------------------------


class TestAllToolsAllowed:
    @pytest.mark.asyncio
    async def test_all_tools_returned_when_all_allowed(self) -> None:
        subject = _make_subject()
        server_slug = "github-mcp"
        tool_names = ["list_repos", "create_issue", "delete_repo"]
        response = _make_tools_response(tool_names)

        perms = [
            _make_perm(server_pattern="*", tool_pattern="*", effect=PermissionEffect.ALLOW),
        ]

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=perms)

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        returned_names = [t["name"] for t in result["result"]["tools"]]
        assert set(returned_names) == set(tool_names)
        assert len(returned_names) == 3


# ---------------------------------------------------------------------------
# Some tools denied
# ---------------------------------------------------------------------------


class TestSomeToolsDenied:
    @pytest.mark.asyncio
    async def test_denied_tools_removed(self) -> None:
        subject = _make_subject()
        server_slug = "github-mcp"
        response = _make_tools_response(["list_repos", "delete_everything", "create_issue"])

        perms = [
            _make_perm(server_pattern="*", tool_pattern="*", effect=PermissionEffect.ALLOW),
            _make_perm(
                server_pattern="github-mcp",
                tool_pattern="delete_everything",
                effect=PermissionEffect.DENY,
                priority=10,
            ),
        ]

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=perms)

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        returned_names = [t["name"] for t in result["result"]["tools"]]
        assert "delete_everything" not in returned_names
        assert "list_repos" in returned_names
        assert "create_issue" in returned_names
        assert len(returned_names) == 2

    @pytest.mark.asyncio
    async def test_all_tools_denied_returns_empty_list(self) -> None:
        subject = _make_subject()
        server_slug = "restricted-server"
        response = _make_tools_response(["tool_a", "tool_b"])

        perms: list[ToolPermission] = []  # Default deny — no permissions

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=perms)

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        assert result["result"]["tools"] == []


# ---------------------------------------------------------------------------
# Missing tools key in result
# ---------------------------------------------------------------------------


class TestMissingToolsKey:
    @pytest.mark.asyncio
    async def test_no_tools_key_returns_response_unchanged(self) -> None:
        subject = _make_subject()
        server_slug = "github-mcp"
        response = {
            "jsonrpc": "2.0",
            "id": 42,
            "result": {"_meta": {"some": "metadata"}},
        }

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=[])

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        # Result key is preserved
        assert result["result"]["_meta"] == {"some": "metadata"}
        assert "tools" not in result["result"]

    @pytest.mark.asyncio
    async def test_no_result_key_returns_response_unchanged(self) -> None:
        subject = _make_subject()
        server_slug = "github-mcp"
        # A notification or error response — no "result" key
        response = {
            "jsonrpc": "2.0",
            "id": 99,
            "error": {"code": -32600, "message": "Invalid Request"},
        }

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=[])

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        assert "error" in result
        assert result["error"]["code"] == -32600


# ---------------------------------------------------------------------------
# JSON-RPC id and jsonrpc version preserved
# ---------------------------------------------------------------------------


class TestJsonRpcMetadataPreserved:
    @pytest.mark.asyncio
    async def test_jsonrpc_version_preserved(self) -> None:
        subject = _make_subject()
        server_slug = "my-server"
        response = _make_tools_response(["tool_x"], jsonrpc_id=7)

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=[])

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        assert result["jsonrpc"] == "2.0"

    @pytest.mark.asyncio
    async def test_jsonrpc_id_int_preserved(self) -> None:
        subject = _make_subject()
        server_slug = "my-server"
        response = _make_tools_response(["tool_x"], jsonrpc_id=42)

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=[])

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        assert result["id"] == 42

    @pytest.mark.asyncio
    async def test_jsonrpc_id_string_preserved(self) -> None:
        subject = _make_subject()
        server_slug = "my-server"
        response = _make_tools_response(["tool_x"], jsonrpc_id="req-abc-123")

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=[])

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        assert result["id"] == "req-abc-123"

    @pytest.mark.asyncio
    async def test_result_meta_preserved_after_filtering(self) -> None:
        subject = _make_subject()
        server_slug = "my-server"
        response = _make_tools_response(["tool_a", "tool_b"], jsonrpc_id=1)

        perms = [
            _make_perm(
                server_pattern="my-server",
                tool_pattern="tool_a",
                effect=PermissionEffect.ALLOW,
            ),
        ]

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=perms)

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        # _meta must still be present
        assert result["result"]["_meta"] == {"some": "metadata"}
        # Only allowed tool remains
        assert len(result["result"]["tools"]) == 1
        assert result["result"]["tools"][0]["name"] == "tool_a"


# ---------------------------------------------------------------------------
# Input dict is NOT mutated
# ---------------------------------------------------------------------------


class TestNoMutation:
    @pytest.mark.asyncio
    async def test_input_dict_not_mutated(self) -> None:
        subject = _make_subject()
        server_slug = "my-server"
        tool_names = ["tool_a", "tool_b", "tool_c"]
        response = _make_tools_response(tool_names)
        original = copy.deepcopy(response)

        perms = [
            _make_perm(
                server_pattern="my-server",
                tool_pattern="tool_a",
                effect=PermissionEffect.ALLOW,
            ),
        ]

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=perms)

            await filter_tools_list(response, subject, server_slug, mock_session)

        # The original response dict must be unchanged
        assert response == original
        assert len(response["result"]["tools"]) == 3

    @pytest.mark.asyncio
    async def test_returned_dict_is_independent_copy(self) -> None:
        """Mutating the returned dict must not affect the input."""
        subject = _make_subject()
        server_slug = "my-server"
        response = _make_tools_response(["tool_a"])
        original_tools_list = response["result"]["tools"]

        perms = [
            _make_perm(server_pattern="*", tool_pattern="*", effect=PermissionEffect.ALLOW),
        ]

        mock_session = AsyncMock()
        with patch("app.auth.tool_filter.RbacRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_permissions_for_subject = AsyncMock(return_value=perms)

            result = await filter_tools_list(response, subject, server_slug, mock_session)

        # Mutate the result
        result["result"]["tools"].append({"name": "injected"})

        # Original should be unaffected
        assert len(response["result"]["tools"]) == 1
        assert original_tools_list is response["result"]["tools"]
