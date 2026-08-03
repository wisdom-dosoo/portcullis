"""Immutable subject and issued-key value types."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class Subject:
    """Authenticated principal carrying identity and authorisation scopes."""

    key_id: UUID
    tenant_id: UUID
    scopes: frozenset[str]

    def has_scope(self, scope: str) -> bool:
        """Return True if this subject holds the requested scope."""
        return scope in self.scopes


@dataclass(frozen=True)
class IssuedKey:
    """One-time view of a freshly issued API key.

    The plaintext is shown exactly once at issuance and never persisted.
    """

    key_id: UUID
    plaintext: str
    prefix: str
    scopes: frozenset[str]
