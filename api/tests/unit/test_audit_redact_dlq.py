"""Ship-checklist: audit PII redaction + DLQ spill never raises."""

from __future__ import annotations

from app.observability.audit_dlq import spill_to_dlq
from app.observability.redact import REDACTED, redact_detail


def test_redact_secret_keys() -> None:
    detail = {
        "password": "hunter2",
        "api_key": "sk-live-123",
        "nested": {"token": "abc", "safe": "hello"},
        "args": {"query": "select *"},
    }
    out = redact_detail(detail)
    assert out["password"] == REDACTED
    assert out["api_key"] == REDACTED
    assert out["nested"]["token"] == REDACTED
    assert out["nested"]["safe"] == "hello"
    # Input not mutated.
    assert detail["password"] == "hunter2"


def test_redact_inline_api_key_and_email() -> None:
    out = redact_detail(
        {
            "text": "key pk_abcdefgh_1234567890123456789012345678901234567 done",
            "contact": "jane@company.com",
        }
    )
    assert REDACTED in out["text"]
    assert "pk_abcdefgh" not in out["text"]
    assert out["contact"] == "***@company.com"


def test_redact_truncates_huge_strings() -> None:
    out = redact_detail({"blob": "x" * 5000})
    assert "truncated" in out["blob"]
    assert len(out["blob"]) < 3000


def test_spill_to_dlq_empty_path_noop() -> None:
    assert spill_to_dlq("", {"a": 1}) is False


def test_spill_to_dlq_roundtrip(tmp_path) -> None:
    import json
    from pathlib import Path

    path = str(tmp_path / "dlq.jsonl")
    assert spill_to_dlq(path, {"event_type": "tool_call", "detail": {"a": 1}}) is True
    lines = Path(path).read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["event_type"] == "tool_call"
