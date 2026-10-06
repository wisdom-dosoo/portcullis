"""PII/secret redaction for audit log payloads.

Ship-checklist: tool arguments flow through the proxy and can carry API keys,
passwords, tokens, and PII. The audit log must never persist them verbatim.
`redact_detail` is applied on every `record_event` write path.
"""

from __future__ import annotations

import re
from typing import Any

REDACTED = "[REDACTED]"

# Case-insensitive key match — redacts the VALUE when the key looks secret.
_SECRET_KEY_RE = re.compile(
    r"(password|passwd|secret|token|api[_-]?key|auth|authorization|"
    r"bearer|cookie|session|private[_-]?key|client[_-]?secret|"
    r"access[_-]?token|refresh[_-]?token|ssn|credit[_-]?card|card[_-]?number)",
    re.IGNORECASE,
)

# Inline secret shapes inside free-text strings (pk_*, Bearer, AWS, PEM...).
_INLINE_PATTERNS = (
    re.compile(r"pk_[A-Za-z0-9\-_]{8,}_[A-Za-z0-9\-_]{20,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/=]{10,}", re.IGNORECASE),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),  # emails → keep domain hint
)


def _redact_string(value: str) -> str:
    redacted = value
    for pat in _INLINE_PATTERNS[:4]:
        redacted = pat.sub(REDACTED, redacted)
    # Emails: keep domain for debugging, drop local part.
    redacted = re.sub(
        r"([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})",
        r"***@\2",
        redacted,
    )
    return redacted


def redact_value(key: str | None, value: Any, depth: int = 0) -> Any:
    """Redact a single value given its key context (recursive, depth-capped)."""
    if depth > 6:
        return REDACTED
    if isinstance(value, dict):
        return {
            str(k): (
                REDACTED if _SECRET_KEY_RE.search(str(k)) else redact_value(str(k), v, depth + 1)
            )
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact_value(key, v, depth + 1) for v in value]
    if isinstance(value, str):
        if key is not None and _SECRET_KEY_RE.search(key):
            return REDACTED
        if len(value) > 2000:
            # Bound unbounded tool args — keep a prefix for debugging.
            return _redact_string(value[:2000]) + f"...[truncated {len(value) - 2000} chars]"
        return _redact_string(value)
    return value


def redact_detail(detail: dict[str, Any] | None) -> dict[str, Any]:
    """Return a redacted copy of an audit `detail` payload (never mutates input)."""
    if not detail:
        return {}
    if not isinstance(detail, dict):
        return {"value": redact_value(None, detail)}
    return {str(k): redact_value(str(k), v) for k, v in detail.items()}
