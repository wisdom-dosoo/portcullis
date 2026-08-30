"""Portcullis management CLI."""

from __future__ import annotations

import argparse
import asyncio

from app.auth.api_keys import issue_key
from app.config import get_settings
from app.gateway.registry import DEFAULT_TENANT_ID
from app.models.orm import AuditEventType, LicensePlan, SubjectType
from app.models.schemas import TenantProvisionRequest
from app.provisioning import ProvisioningError, ProvisioningService
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository
from app.runtime import Runtime
from app.telemetry.identity import InstallIdentity


def main() -> None:
    """Entry point for the ``portcullis`` CLI."""
    parser = argparse.ArgumentParser(prog="portcullis")
    subparsers = parser.add_subparsers(dest="command")

    admin_key_parser = subparsers.add_parser("admin-key", help="Manage admin API keys")
    admin_key_parser.add_argument("action", help="Action to perform (create)")
    admin_key_parser.add_argument("--name", required=True, help="Name for the new API key")

    admin_parser = subparsers.add_parser("admin", help="Platform administration")
    admin_subparsers = admin_parser.add_subparsers(dest="admin_command")

    bootstrap_parser = admin_subparsers.add_parser(
        "bootstrap", help="Promote a user to platform admin"
    )
    bootstrap_parser.add_argument("email", help="Email of the user to promote")

    provision_parser = subparsers.add_parser(
        "provision-tenant", help="Provision a new managed tenant"
    )
    provision_parser.add_argument("--name", required=True, help="Tenant display name")
    provision_parser.add_argument("--slug", required=True, help="Tenant slug (unique)")
    provision_parser.add_argument("--owner-email", required=True, help="Owner account email")
    provision_parser.add_argument("--owner-full-name", required=True, help="Owner full name")
    provision_parser.add_argument(
        "--owner-password", default=None, help="Owner password (generated if omitted)"
    )
    provision_parser.add_argument(
        "--plan",
        default="pro",
        choices=[p.value for p in LicensePlan],
        help="License plan (default: pro)",
    )
    provision_parser.add_argument(
        "--licensee", default=None, help="Licensee name (defaults to tenant name)"
    )
    provision_parser.add_argument("--seat-limit", type=int, default=5, help="License seat limit")
    provision_parser.add_argument(
        "--server-limit", type=int, default=None, help="License server limit"
    )
    provision_parser.add_argument(
        "--expires-in-days", type=int, default=365, help="License term in days"
    )

    telemetry_parser = subparsers.add_parser("telemetry", help="Self-host telemetry status")
    telemetry_subparsers = telemetry_parser.add_subparsers(dest="telemetry_command")
    telemetry_subparsers.add_parser(
        "status", help="Show whether telemetry is enabled and this install's anonymous id"
    )

    args = parser.parse_args()

    if args.command == "admin-key" and args.action == "create":
        asyncio.run(_create_admin_key(args.name))
    elif args.command == "admin" and args.admin_command == "bootstrap":
        asyncio.run(_bootstrap_admin(args.email))
    elif args.command == "provision-tenant":
        asyncio.run(_provision_tenant(args))
    elif args.command == "telemetry" and args.telemetry_command == "status":
        _telemetry_status()
    else:
        parser.print_help()


async def _create_admin_key(name: str) -> None:
    """Create an admin API key and print the plaintext to stdout."""
    settings = get_settings()
    runtime = Runtime.build(settings)
    try:
        async with runtime.session_factory() as session:
            issued = await issue_key(
                name=name,
                scopes=["admin"],
                pepper=settings.api_key_pepper,
                session=session,
                tenant_id=DEFAULT_TENANT_ID,
            )
        print(issued.plaintext)
    finally:
        await runtime.close()


async def _bootstrap_admin(email: str) -> None:
    """Promote a user to platform admin and print their first access token.

    Idempotent: re-promoting an already-admin user succeeds and mints a fresh
    token. The plaintext key is printed once and never stored.
    """
    settings = get_settings()
    runtime = Runtime.build(settings)
    try:
        async with runtime.session_factory() as session:
            repo = UserRepository(session)
            user = await repo.get_by_email(DEFAULT_TENANT_ID, email)
            if user is None:
                raise SystemExit(f"No user found with email: {email}")

            if not await repo.set_platform_admin(DEFAULT_TENANT_ID, user.id, True):
                raise SystemExit(f"Could not promote user: {email}")

            issued = await issue_key(
                name=f"user:{user.email}",
                scopes=[],
                pepper=settings.api_key_pepper,
                session=session,
                tenant_id=DEFAULT_TENANT_ID,
                user_id=user.id,
            )

            audit = AuditRepository(session)
            await audit.create(
                event_type=AuditEventType.PLATFORM_ADMIN_GRANTED,
                outcome="allowed",
                tenant_id=DEFAULT_TENANT_ID,
                subject_id=str(user.id),
                subject_type=SubjectType.API_KEY,
                detail={"email": user.email},
            )
            await session.commit()
        print(issued.plaintext)
    finally:
        await runtime.close()


async def _provision_tenant(args: argparse.Namespace) -> None:
    """Provision a new tenant and print one-time credentials to stdout.

    Uses the shared ProvisioningService so the CLI produces the exact same
    tenant state as ``POST /admin/tenants``.
    """
    settings = get_settings()
    runtime = Runtime.build(settings)
    try:
        async with runtime.session_factory() as session:
            request = TenantProvisionRequest(
                name=args.name,
                slug=args.slug,
                owner_email=args.owner_email,
                owner_full_name=args.owner_full_name,
                owner_password=args.owner_password,
                plan=LicensePlan(args.plan),
                licensee=args.licensee,
                seat_limit=args.seat_limit,
                server_limit=args.server_limit,
                expires_in_days=args.expires_in_days,
            )
            try:
                result = await ProvisioningService().provision_tenant(
                    session,
                    settings,
                    name=request.name,
                    slug=request.slug,
                    owner_email=request.owner_email,
                    owner_full_name=request.owner_full_name,
                    plan=request.plan,
                    licensee=request.licensee or request.name,
                    seat_limit=request.seat_limit,
                    server_limit=request.server_limit,
                    expires_in_days=request.expires_in_days,
                    owner_password=request.owner_password,
                )
            except ProvisioningError as exc:
                raise SystemExit(str(exc)) from exc

        print(f"Tenant provisioned: {result.tenant.name} ({result.tenant.slug})")
        print(f"  tenant_id:      {result.tenant.id}")
        print(f"  owner_email:    {result.owner.email}")
        print(f"  access_token:   {result.access_token}")
        print(f"  license_key:    {result.license_key}")
        print(f"  plan:           {result.license.plan.value}")
        if args.owner_password is None:
            print(f"  owner_password: {result.owner_password}  # generated — copy it now")
    finally:
        await runtime.close()


def _telemetry_status() -> None:
    """Print this install's telemetry state without touching the network.

    Shows whether reporting is enabled, the target endpoint, and the
    anonymous install id the gateway would report (either the pinned id or
    the one persisted at first boot).  The id is stable across restarts, so
    an operator can carry it into a Cloud signup later if they want to.
    """
    settings = get_settings()
    identity = InstallIdentity(
        install_id=settings.telemetry_install_id,
        state_file=settings.telemetry_state_file,
    )

    print(f"  enabled:       {settings.telemetry_enabled}")
    print(f"  endpoint:      {settings.telemetry_endpoint_url or '(unset — reporter idle)'}")
    print(f"  interval:      {settings.telemetry_interval_seconds}s")
    print(f"  install_id:    {identity.install_id}")
    print(f"  state_file:    {settings.telemetry_state_file}")
    if settings.telemetry_install_id:
        print("  note:          install_id pinned via TELEMETRY_INSTALL_ID")


if __name__ == "__main__":
    main()
