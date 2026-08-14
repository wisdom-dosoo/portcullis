"""Immutable subject and issued-key value types."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.models.orm import SubjectType


@dataclass(frozen=True)
class Subject:
    """Authenticated principal carrying identity and authorisation scopes.

    ``subject_id`` is a stable string identifier:
    - For API-key subjects: the string representation of the api_keys.id UUID.
    - For OAuth subjects: the ``sub`` claim from the verified JWT.
    """

    subject_id: str
    subject_type: SubjectType
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
