"""Portcullis management CLI."""

from __future__ import annotations

import argparse
import asyncio

from app.auth.api_keys import issue_key
from app.config import get_settings
from app.gateway.registry import DEFAULT_TENANT_ID
from app.runtime import Runtime


def main() -> None:
    """Entry point for the ``portcullis`` CLI."""
    parser = argparse.ArgumentParser(prog="portcullis")
    subparsers = parser.add_subparsers(dest="command")

    admin_key_parser = subparsers.add_parser("admin-key", help="Manage admin API keys")
    admin_key_parser.add_argument("action", help="Action to perform (create)")
    admin_key_parser.add_argument("--name", required=True, help="Name for the new API key")

    args = parser.parse_args()

    if args.command == "admin-key" and args.action == "create":
        asyncio.run(_create_admin_key(args.name))
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
