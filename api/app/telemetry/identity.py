"""Persistent anonymous install identity for self-host telemetry."""

from __future__ import annotations

import uuid
from pathlib import Path
from uuid import UUID

import structlog

logger = structlog.get_logger(__name__)


class InstallIdentity:
    """Owns the install's persistent anonymous id.

    Resolution order (first match wins):
      1. ``settings.telemetry_install_id`` — operator-pinned, e.g. to carry
         the same id into a Cloud signup for the Phase 4 conversion funnel.
      2. The state file — the id generated on first boot, persisted so the
         install keeps one stable id across restarts and data resets.
      3. A freshly generated UUID, written to the state file for future runs.

    Persistence failures are logged, not fatal: telemetry is best-effort, and
    a missing file just means the id is regenerated next boot (which would
    under-count, never over-count — consistent with the lower-bound framing).
    """

    def __init__(self, *, install_id: str | None = None, state_file: str = "") -> None:
        self._pinned = install_id
        self._state_file = Path(state_file) if state_file else None

    @property
    def install_id(self) -> UUID:
        if self._pinned:
            return UUID(self._pinned)

        cached = self._read_state()
        if cached is not None:
            return cached

        fresh = uuid.uuid4()
        self._write_state(fresh)
        return fresh

    def _read_state(self) -> UUID | None:
        if self._state_file is None:
            return None
        try:
            raw = self._state_file.read_text(encoding="utf-8").strip()
            return UUID(raw)
        except FileNotFoundError:
            return None
        except (ValueError, OSError):
            logger.warning("telemetry.identity.read_failed", path=str(self._state_file))
            return None

    def _write_state(self, value: UUID) -> None:
        if self._state_file is None:
            return
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(str(value), encoding="utf-8")
        except OSError:
            logger.warning(
                "telemetry.identity.write_failed",
                path=str(self._state_file),
            )


__all__ = ["InstallIdentity"]
