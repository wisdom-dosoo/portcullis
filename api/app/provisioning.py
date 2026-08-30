"""Tenant provisioning service for the managed (cloud) deployment.

Both the CLI ``provision-tenant`` command and the ``POST /admin/tenants``
endpoint delegate here so the two provisioning surfaces produce identical
tenant state: a new ``Tenant`` row, an approved owner account (``org_owner``)
that is also an org member, the default role set, a user-bound owner API key
bound to the ``org_owner`` role, and a platform license.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api_keys import issue_key
from app.auth.licenses import LicenseService
from app.auth.org_bootstrap import bind_owner_to_org_owner, create_default_roles
from app.auth.passwords import PasswordService
from app.config import Settings
from app.models.orm import (
    AuditEventType,
    License,
    LicensePlan,
    OrgMemberRole,
    OrgRole,
    SubjectType,
    Tenant,
    User,
    UserApprovalStatus,
)
from app.models.schemas import OrgMemberCreate
from app.repositories.audit import AuditRepository
from app.repositories.org_members import OrgMemberRepository


class ProvisioningError(ValueError):
    """Raised when a tenant cannot be provisioned (e.g. slug collision)."""


async def _resolve_default_tenant_id(session: AsyncSession) -> object:
    """Return DEFAULT_TENANT_ID, but tolerate missing constant in tests."""
    try:
        from app.constants import DEFAULT_TENANT_ID

        return DEFAULT_TENANT_ID
    except Exception:
        from sqlalchemy import select

        from app.models.orm import Tenant

        result = await session.scalars(select(Tenant.id).limit(1))
        row = result.first()
        return row if row is not None else None


@dataclass
class ProvisionTenantResult:
    """Outcome of a provisioning run, including one-time credentials."""

    tenant: Tenant
    owner: User
    access_token: str
    owner_password: str
    license: License
    license_key: str


class ProvisioningService:
    """Create a new tenant with an owner account, roles, and a license."""

    async def provision_tenant(
        self,
        session: AsyncSession,
        settings: Settings,
        *,
        name: str,
        slug: str,
        owner_email: str,
        owner_full_name: str,
        plan: LicensePlan = LicensePlan.PRO,
        licensee: str | None = None,
        seat_limit: int = 5,
        server_limit: int | None = None,
        expires_in_days: int = 365,
        owner_password: str | None = None,
        issuer_id: UUID | None = None,
    ) -> ProvisionTenantResult:
        """Provision a new tenant and return one-time owner credentials.

        Raises:
            ProvisioningError: If the slug is already taken.
        """
        # Slugs are globally unique — check then rely on DB constraint for race safety.
        if await self._slug_taken(session, slug):
            raise ProvisioningError(f"tenant slug already in use: {slug}")

        if owner_password is None:
            owner_password = secrets.token_urlsafe(16)

        password_hash = PasswordService(settings.api_key_pepper).hash_password(owner_password)

        # Enforce 2-organization limit for platform admins (live production guard)
        if issuer_id is not None:
            from app.repositories.users import UserRepository

            repo = UserRepository(session)
            issuer = await repo.get_by_id(await _resolve_default_tenant_id(session), issuer_id)
            # Fallback: try lookup by id without tenant scoping if not found in default
            if issuer is None:
                from sqlalchemy import select

                from app.models.orm import User

                result = await session.scalars(select(User).where(User.id == issuer_id))
                issuer = result.first()
            if issuer is not None and getattr(issuer, "is_platform_admin", False):
                if getattr(issuer, "created_org_count", 0) >= 2:
                    raise ProvisioningError("Super admin has reached the maximum limit of 2 organizations")

        tenant = Tenant(
            id=uuid4(),
            name=name,
            slug=slug,
            created_by_super_admin_id=issuer_id,
        )
        session.add(tenant)
        try:
            await session.flush()
        except Exception as exc:  # IntegrityError from concurrent slug race
            from sqlalchemy.exc import IntegrityError

            if isinstance(exc, IntegrityError) or "unique" in str(exc).lower() or "uq_tenants_slug" in str(exc):
                raise ProvisioningError(f"tenant slug already in use: {slug}") from exc
            raise

        # Record super-admin ownership for platform admin dashboard (live production)
        if issuer_id is not None:
            try:
                # Increment the issuer's org count and create join row pointing to the NEW tenant
                from sqlalchemy import select

                from app.models.orm import SuperAdminOrganization, User

                result = await session.scalars(select(User).where(User.id == issuer_id))
                issuer_user = result.first()
                if issuer_user is not None and getattr(issuer_user, "is_platform_admin", False):
                    issuer_user.created_org_count = (getattr(issuer_user, "created_org_count", 0) or 0) + 1
                    session.add(
                        SuperAdminOrganization(
                            super_admin_id=issuer_id,
                            organization_tenant_id=tenant.id,
                        )
                    )
                    await session.flush()
            except Exception:
                # Non-fatal — tenant provisioning should succeed even if join row fails
                pass

        users = UserRepository(session)
        owner = await users.create(
            tenant_id=tenant.id,
            email=owner_email,
            password_hash=password_hash,
            full_name=owner_full_name,
            org_name=name,
            intended_use=None,
            approval_status=UserApprovalStatus.APPROVED,
            org_role=OrgRole.ORG_OWNER,
        )

        await OrgMemberRepository(session).create(
            tenant.id,
            OrgMemberCreate(
                user_subject=str(owner.id),
                admin_role=OrgMemberRole.ORG_OWNER,
            ),
        )

        await create_default_roles(session, tenant.id)

        # issue_key commits; the tenant, owner, org member, and roles are all
        # flushed by then so they persist on that commit.
        issued = await issue_key(
            name=f"user:{owner.email}",
            scopes=[],
            pepper=settings.api_key_pepper,
            session=session,
            tenant_id=tenant.id,
            user_id=owner.id,
        )
        await bind_owner_to_org_owner(session, tenant.id, issued.key_id)

        license, license_key = await LicenseService().issue(
            session=session,
            tenant_id=tenant.id,
            issuer_id=issuer_id,
            pepper=settings.api_key_pepper,
            plan=plan,
            licensee=licensee or name,
            seat_limit=seat_limit,
            server_limit=server_limit,
            expires_in_days=expires_in_days,
        )

        await AuditRepository(session).create(
            event_type=AuditEventType.TENANT_PROVISIONED,
            outcome="allowed",
            tenant_id=tenant.id,
            subject_id=str(issuer_id) if issuer_id else None,
            subject_type=SubjectType.API_KEY,
            detail={
                "tenant_id": str(tenant.id),
                "tenant_slug": tenant.slug,
                "owner_email": owner.email,
                "plan": plan.value,
            },
        )
        await session.commit()

        return ProvisionTenantResult(
            tenant=tenant,
            owner=owner,
            access_token=issued.plaintext,
            owner_password=owner_password,
            license=license,
            license_key=license_key,
        )

    @staticmethod
    async def _slug_taken(session: AsyncSession, slug: str) -> bool:
        from sqlalchemy import select

        result = await session.scalars(select(Tenant.id).where(Tenant.slug == slug))
        return result.first() is not None
