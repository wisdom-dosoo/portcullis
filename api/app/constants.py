"""Process-wide constants shared across application modules."""

from __future__ import annotations

from uuid import UUID

# The single-tenant sentinel used throughout the v0.x control plane.
# All resources belong to this tenant until multi-tenancy is introduced.
DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
