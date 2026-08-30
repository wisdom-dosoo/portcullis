"""Tool filtering boundary — applies RBAC to tools/list responses."""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.rbac import evaluate_permission
from app.auth.subject import Subject
from app.repositories.rbac import RbacRepository


def _filter_list_by_permission(
    items: list[dict[str, Any]],
    subject: Subject,
    server_slug: str,
    permissions: list,
    name_key: str,
) -> list[dict[str, Any]]:
    """Filter a list of items by RBAC permission.

    Args:
        items: List of items with a 'name' field.
        subject: Authenticated subject.
        server_slug: Server slug for RBAC.
        permissions: List of permissions for the subject.
        name_key: The key to use for the resource name (e.g., 'name', 'uri').
    """
    return [
        item
        for item in items
        if name_key in item
        and evaluate_permission(
            subject.subject_id, server_slug, item[name_key], permissions
        ).allowed
    ]


async def _filter_generic_list(
    response_body: dict[str, Any],
    subject: Subject,
    server_slug: str,
    session: AsyncSession,
    list_key: str,
    name_key: str,
) -> dict[str, Any]:
    """Generic filter for list responses (tools, resources, prompts, roots)."""
    result_key = response_body.get("result")
    if result_key is None or list_key not in result_key:
        return copy.deepcopy(response_body)

    repo = RbacRepository(session)
    permissions = await repo.get_permissions_for_subject(
        subject.tenant_id,
        subject.subject_type,
        subject.subject_id,
    )

    items = result_key[list_key]
    allowed_items = _filter_list_by_permission(items, subject, server_slug, permissions, name_key)

    new_response = copy.deepcopy(response_body)
    new_response["result"][list_key] = allowed_items
    return new_response


async def filter_tools_list(
    response_body: dict[str, Any],
    subject: Subject,
    server_slug: str,
    session: AsyncSession,
) -> dict[str, Any]:
    """Filter tools/list response to only include permitted tools."""
    return await _filter_generic_list(
        response_body, subject, server_slug, session, list_key="tools", name_key="name"
    )


async def filter_resources_list(
    response_body: dict[str, Any],
    subject: Subject,
    server_slug: str,
    session: AsyncSession,
) -> dict[str, Any]:
    """Filter resources/list response to only include permitted resources."""
    return await _filter_generic_list(
        response_body, subject, server_slug, session, list_key="resources", name_key="uri"
    )


async def filter_prompts_list(
    response_body: dict[str, Any],
    subject: Subject,
    server_slug: str,
    session: AsyncSession,
) -> dict[str, Any]:
    """Filter prompts/list response to only include permitted prompts."""
    return await _filter_generic_list(
        response_body, subject, server_slug, session, list_key="prompts", name_key="name"
    )


async def filter_roots_list(
    response_body: dict[str, Any],
    subject: Subject,
    server_slug: str,
    session: AsyncSession,
) -> dict[str, Any]:
    """Filter roots/list response to only include permitted roots."""
    return await _filter_generic_list(
        response_body, subject, server_slug, session, list_key="roots", name_key="uri"
    )
