"""Rate-limit policy repository for CRUD operations scoped to a tenant."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import RateLimitPolicy
from app.models.schemas import RateLimitPolicyCreate, RateLimitPolicyUpdate


class RateLimitRepository:
    """Data access layer for rate-limit policy records."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, tenant_id: UUID, data: RateLimitPolicyCreate) -> RateLimitPolicy:
        """Persist a new rate-limit policy and return the ORM instance."""
        policy = RateLimitPolicy(
            tenant_id=tenant_id,
            subject_id=data.subject_id,
            server_pattern=data.server_pattern,
            tool_pattern=data.tool_pattern,
            algorithm=data.algorithm,
            request_limit=data.request_limit,
            window_seconds=data.window_seconds,
            burst_capacity=data.burst_capacity,
            priority=data.priority,
        )
        self._session.add(policy)
        await self._session.flush()
        return policy

    async def list(self, tenant_id: UUID) -> list[RateLimitPolicy]:
        """Return all rate-limit policies for the given tenant."""
        result = await self._session.scalars(
            select(RateLimitPolicy).where(RateLimitPolicy.tenant_id == tenant_id)
        )
        return list(result.all())

    async def get(self, tenant_id: UUID, policy_id: UUID) -> RateLimitPolicy | None:
        """Return a single policy by ID scoped to tenant, or None if not found."""
        result = await self._session.scalars(
            select(RateLimitPolicy).where(
                RateLimitPolicy.id == policy_id,
                RateLimitPolicy.tenant_id == tenant_id,
            )
        )
        return result.first()

    async def update(self, policy: RateLimitPolicy, data: RateLimitPolicyUpdate) -> RateLimitPolicy:
        """Apply partial updates to the policy and return the updated ORM instance."""
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(policy, field, value)
        await self._session.flush()
        return policy

    async def delete(self, policy: RateLimitPolicy) -> None:
        """Remove the policy from the database."""
        await self._session.delete(policy)
        await self._session.flush()
