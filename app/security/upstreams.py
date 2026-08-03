"""Upstream URL security validation."""

from __future__ import annotations

import urllib.parse

from app.config import Environment


def validate_upstream_url(
    url: str,
    allowed_hosts: tuple[str, ...],
    environment: Environment,
) -> None:
    """Validate an upstream URL against security constraints.

    Raises:
        ValueError: with a descriptive message for any constraint violation.
    """
    parsed = urllib.parse.urlparse(url)

    # Reject URLs with fragments
    if parsed.fragment:
        raise ValueError("Upstream URL must not contain a fragment (#)")

    # Reject URLs with embedded credentials
    if "@" in parsed.netloc:
        raise ValueError("Upstream URL must not contain credentials (user:password@host)")

    # Scheme validation based on environment
    scheme = parsed.scheme.lower()
    if environment in (Environment.PRODUCTION, Environment.STAGING):
        if scheme != "https":
            raise ValueError(
                f"Upstream URL must use HTTPS in {environment} environment (got '{scheme}')"
            )
    else:
        # DEVELOPMENT: allow http or https
        if scheme not in ("http", "https"):
            raise ValueError(
                f"Upstream URL must use http or https scheme (got '{scheme}')"
            )

    # Host allow-list check (case-insensitive exact match)
    hostname = parsed.hostname or ""
    if not any(hostname.lower() == allowed.lower() for allowed in allowed_hosts):
        raise ValueError(
            f"Upstream host '{hostname}' is not in the allowed hosts list: {list(allowed_hosts)}"
        )
