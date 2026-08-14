"""Tool filtering boundary — applies RBAC to tools/list responses."""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.rbac import evaluate_permission
from app.auth.subject import Subject
from app.repositories.rbac import RbacRepository


async def filter_tools_list(
    response_body: dict[str, Any],
    subject: Subject,
    server_slug: str,
    session: AsyncSession,
) -> dict[str, Any]:
    """Filter tools/list response to only include permitted tools.

    Returns a new dict preserving jsonrpc, id, and all result metadata.
    The result.tools list is filtered; any tool the subject cannot call is
    removed.  Does NOT mutate the input dict.

    If ``result`` or ``result.tools`` are absent, the response is returned
    as-is (deep-copied so the contract holds).
    """
    result_key = response_body.get("result")
    if result_key is None or "tools" not in result_key:
        # Nothing to filter — return a deep copy to preserve non-mutation contract.
        return copy.deepcopy(response_body)

    repo = RbacRepository(session)
    permissions = await repo.get_permissions_for_subject(subject.subject_id)

    tools = result_key["tools"]
    allowed_tools = [
        tool
        for tool in tools
        if evaluate_permission(subject.subject_id, server_slug, tool["name"], permissions).allowed
    ]

    # Build a new response dict — deep copy everything, then replace the tools list.
    new_response = copy.deepcopy(response_body)
    new_response["result"]["tools"] = allowed_tools
    return new_response
