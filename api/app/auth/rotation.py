"""API key rotation and expiry policy system."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from uuid import UUID

import structlog

from app.auth.api_keys import issue_key, revoke_key
from app.auth.subject import IssuedKey, Subject
from app.config import Settings
from app.repositories.api_keys import ApiKeyRepository

logger = structlog.get_logger(__name__)


class RotationTrigger(Enum):
    """Triggers for key rotation."""

    MANUAL = "manual"
    SCHEDULED = "scheduled"
    EXPIRY = "expiry"
    COMPROMISE = "compromise"
    POLICY_CHANGE = "policy_change"


@dataclass(frozen=True)
class RotationPolicy:
    """Configuration for API key rotation."""

    max_age_days: int = 90
    warning_days_before: int = 7
    auto_rotate: bool = False
    max_keys_per_subject: int = 5
    grace_period_days: int = 30  # Old key remains valid during transition


@dataclass
class RotationResult:
    """Result of a key rotation operation."""

    old_key_id: UUID
    new_key: IssuedKey
    trigger: RotationTrigger
    rotated_at: datetime
    warning_issued: bool = False


class ApiKeyRotationService:
    """Manages API key rotation and expiry enforcement."""

    def __init__(
        self,
        session_factory,
        settings: Settings,
        policy: RotationPolicy | None = None,
    ):
        self._session_factory = session_factory
        self._settings = settings
        self._policy = policy or RotationPolicy()

    async def rotate_key(
        self,
        key_id: UUID,
        trigger: RotationTrigger = RotationTrigger.MANUAL,
        subject: Subject | None = None,
    ) -> RotationResult:
        """Rotate an API key, keeping the old one valid during grace period."""
        async with self._session_factory() as session:
            repo = ApiKeyRepository(session)

            old_key = await repo.get_by_id(key_id)
            if not old_key:
                raise ValueError(f"Key {key_id} not found")

            # Issue new key with same scopes
            new_key = await issue_key(
                name=f"{old_key.name} (rotated)",
                scopes=list(old_key.scopes),
                pepper=self._settings.api_key_pepper,
                session=session,
                tenant_id=old_key.tenant_id,
                user_id=old_key.user_id,
            )

            # Mark old key as rotated (but not revoked yet)
            old_key.detail = {
                **(old_key.detail or {}),
                "rotated_at": datetime.now(UTC).isoformat(),
                "rotated_to": str(new_key.key_id),
                "rotation_trigger": trigger.value,
            }
            await session.commit()

            # Schedule revocation after grace period if auto-rotate
            if self._policy.auto_rotate:
                # In production, would schedule a background task
                pass

            logger.info(
                "apikey.rotated",
                old_key_id=str(key_id),
                new_key_id=str(new_key.key_id),
                trigger=trigger.value,
            )

            return RotationResult(
                old_key_id=key_id,
                new_key=new_key,
                trigger=trigger,
                rotated_at=datetime.now(UTC),
            )

    async def revoke_key(
        self, key_id: UUID, trigger: RotationTrigger = RotationTrigger.MANUAL
    ) -> bool:
        """Immediately revoke an API key."""
        async with self._session_factory() as session:
            result = await revoke_key(key_id, trigger=trigger, session=session)
            return result

    async def check_expiry_warnings(self) -> list[dict]:
        """Check for keys nearing expiry and return warnings."""
        warnings = []
        async with self._session_factory() as session:
            repo = ApiKeyRepository(session)
            expiring_keys = await repo.get_expiring_keys(
                self._policy.warning_days_before,
                self._policy.max_age_days,
            )

            for key in expiring_keys:
                days_left = (key.expires_at - datetime.now(UTC)).days if key.expires_at else None
                warnings.append(
                    {
                        "key_id": str(key.id),
                        "key_name": key.name,
                        "subject_id": str(key.id),  # Would need subject lookup
                        "days_until_expiry": days_left,
                        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
                    }
                )

        return warnings

    async def enforce_max_keys_per_subject(self, subject_id: UUID) -> int:
        """Enforce maximum keys per subject, revoking oldest if needed."""
        async with self._session_factory() as session:
            repo = ApiKeyRepository(session)
            keys = await repo.list_by_subject(subject_id)

            if len(keys) <= self._policy.max_keys_per_subject:
                return 0

            # Sort by creation date, oldest first
            keys.sort(key=lambda k: k.created_at)
            to_revoke = keys[: len(keys) - self._policy.max_keys_per_subject]

            revoked = 0
            for key in to_revoke:
                if not key.revoked_at:
                    await revoke_key(key.id, RotationTrigger.POLICY_CHANGE, session)
                    revoked += 1

            await session.commit()
            return revoked

    async def get_key_status(self, key_id: UUID) -> dict | None:
        """Get detailed status of an API key."""
        async with self._session_factory() as session:
            repo = ApiKeyRepository(session)
            key = await repo.get_by_id(key_id)

            if not key:
                return None

            now = datetime.now(UTC)
            is_expired = key.expires_at and key.expires_at < now
            days_until_expiry = (key.expires_at - now).days if key.expires_at else None
            is_warning = (
                days_until_expiry is not None
                and 0 <= days_until_expiry <= self._policy.warning_days_before
            )

            return {
                "key_id": str(key.id),
                "name": key.name,
                "active": not key.revoked_at and not is_expired,
                "revoked": key.revoked_at is not None,
                "expired": is_expired,
                "expires_at": key.expires_at.isoformat() if key.expires_at else None,
                "days_until_expiry": days_until_expiry,
                "warning": is_warning,
                "created_at": key.created_at.isoformat(),
                "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
                "scopes": key.scopes,
            }


class KeyExpiryScheduler:
    """Background scheduler for automated key rotation and expiry checks."""

    def __init__(self, rotation_service: ApiKeyRotationService, interval_hours: int = 24):
        self._rotation_service = rotation_service
        self._interval_hours = interval_hours
        self._running = False

    async def start(self):
        """Start the scheduler."""
        import asyncio

        self._running = True
        while self._running:
            try:
                await self._run_checks()
            except (OSError, RuntimeError, ValueError) as e:
                logger.error("apikey.scheduler.error", error=str(e))

            await asyncio.sleep(self._interval_hours * 3600)

    async def stop(self):
        self._running = False

    async def _run_checks(self):
        """Run periodic expiry and rotation checks."""
        # Check for expiring keys
        warnings = await self._rotation_service.check_expiry_warnings()
        for warning in warnings:
            logger.warning("apikey.expiry_warning", **warning)
            # In production, would send notification (email, webhook, etc.)

        # Check for expired keys that should be revoked
        async with self._rotation_service._session_factory() as session:
            repo = ApiKeyRepository(session)
            expired_keys = await repo.get_expired_keys()

            for key in expired_keys:
                if not key.revoked_at:
                    await self._rotation_service.revoke_key(key.id, RotationTrigger.EXPIRY)
                    logger.info("apikey.auto_revoked_expired", key_id=str(key.id))
