"""Portcullis management CLI."""

from __future__ import annotations

import argparse
import asyncio

from app.auth.api_keys import issue_key
from app.config import get_settings
from app.gateway.registry import DEFAULT_TENANT_ID
from app.models.orm import AuditEventType, SubjectType
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository
from app.runtime import Runtime


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

    args = parser.parse_args()

    if args.command == "admin-key" and args.action == "create":
        asyncio.run(_create_admin_key(args.name))
    elif args.command == "admin" and args.admin_command == "bootstrap":
        asyncio.run(_bootstrap_admin(args.email))
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
