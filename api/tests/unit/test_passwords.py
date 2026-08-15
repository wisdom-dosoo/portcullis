"""Unit tests for the password hashing service."""

from __future__ import annotations

from argon2 import PasswordHasher

from app.auth.passwords import PasswordService

PEPPER = "development-only-change-me"


class TestPasswordService:
    def test_hash_and_verify_round_trip(self) -> None:
        svc = PasswordService(pepper=PEPPER)
        hashed = svc.hash_password("hunter2strong")
        assert hashed != "hunter2strong"
        assert svc.verify_password("hunter2strong", hashed) is True

    def test_wrong_password_fails(self) -> None:
        svc = PasswordService(pepper=PEPPER)
        hashed = svc.hash_password("hunter2strong")
        assert svc.verify_password("wrongpassword", hashed) is False

    def test_pepper_makes_hashes_distinct(self) -> None:
        svc_a = PasswordService(pepper=PEPPER)
        svc_b = PasswordService(pepper="another-pepper-value")
        assert svc_a.hash_password("hunter2strong") != svc_b.hash_password("hunter2strong")

    def test_garbage_hash_rejects(self) -> None:
        svc = PasswordService(pepper=PEPPER)
        assert svc.verify_password("whatever", "not-a-valid-argon2-hash") is False

    def test_uses_injected_hasher(self) -> None:
        hasher = PasswordHasher()
        svc = PasswordService(pepper=PEPPER, ph=hasher)
        hashed = svc.hash_password("hunter2strong")
        assert svc.verify_password("hunter2strong", hashed) is True
