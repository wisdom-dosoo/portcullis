"""Password hashing and verification boundary.

Uses Argon2id with a server-side pepper, mirroring the API key hashing
approach in ``app.auth.api_keys``.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError


class PasswordService:
    """Hash and verify user passwords with Argon2id."""

    def __init__(self, pepper: str, ph: PasswordHasher | None = None) -> None:
        self._pepper = pepper
        self._ph = ph if ph is not None else PasswordHasher()

    def hash_password(self, password: str) -> str:
        """Return the Argon2id hash for the given password."""
        return self._ph.hash(password + self._pepper)

    def verify_password(self, password: str, password_hash: str) -> bool:
        """Return True if the password matches the stored hash.

        The pepper is appended before hashing/verifying, so a database leak
        without the pepper cannot be used to brute-force passwords.
        """
        try:
            return self._ph.verify(password_hash, password + self._pepper)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False
