"""Rate-limit policy endpoint boundary."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.auth.dependencies import admin_subject, authenticated_subject
from app.auth.subject import Subject
from app.models.orm import RateLimitAlgorithm
from app.models.schemas import RateLimitPolicyCreate, RateLimitPolicyUpdate, RateLimitPolicyView
from app.repositories.rate_limits import RateLimitRepository

router = APIRouter(prefix="/v1/rate-limit-policies", tags=["rate-limits"])


@router.post("", status_code=201, response_model=RateLimitPolicyView)
async def create_policy(
    body: RateLimitPolicyCreate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RateLimitPolicyView:
    """Create a new rate-limit policy (admin only)."""
    if body.algorithm == RateLimitAlgorithm.TOKEN_BUCKET and body.burst_capacity is None:
        raise HTTPException(
            status_code=422,
            detail="burst_capacity is required when algorithm is token_bucket",
        )
    repo = RateLimitRepository(session)
    policy = await repo.create(tenant_id=subject.tenant_id, data=body)
    await session.commit()
    return RateLimitPolicyView.model_validate(policy)


@router.get("", status_code=200, response_model=list[RateLimitPolicyView])
async def list_policies(
    subject: Annotated[Subject, Depends(authenticated_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
    response: Response,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[RateLimitPolicyView]:
    """List rate-limit policies for the current tenant (P1: paginated)."""
    repo = RateLimitRepository(session)
    policies = await repo.list(tenant_id=subject.tenant_id)
    response.headers["X-Total-Count"] = str(len(policies))
    return [RateLimitPolicyView.model_validate(p) for p in policies[offset : offset + limit]]


@router.patch("/{policy_id}", status_code=200, response_model=RateLimitPolicyView)
async def update_policy(
    policy_id: UUID,
    body: RateLimitPolicyUpdate,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RateLimitPolicyView:
    """Update an existing rate-limit policy (admin only)."""
    repo = RateLimitRepository(session)
    policy = await repo.get(tenant_id=subject.tenant_id, policy_id=policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Rate-limit policy not found")
    updated = await repo.update(policy=policy, data=body)
    await session.commit()
    return RateLimitPolicyView.model_validate(updated)


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: UUID,
    subject: Annotated[Subject, Depends(admin_subject)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Delete a rate-limit policy (admin only)."""
    repo = RateLimitRepository(session)
    policy = await repo.get(tenant_id=subject.tenant_id, policy_id=policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Rate-limit policy not found")
    await repo.delete(policy=policy)
    await session.commit()
    return Response(status_code=204)
