# ADR-009: Allow-list service-token env vars

## Status
Accepted (P0)

## Context
`service_token_env_var` accepted any string and `extract_service_token` read
it verbatim from `os.environ`, then forwarded it as `Authorization: Bearer` to
the registered `upstream_url`. Any Developer (who may register servers) could
set `upstream_url=https://attacker` + `service_token_env_var=DATABASE_URL` and
exfiltrate process secrets.

## Decision
Only `PORTCULLIS_UPSTREAM_TOKEN_[A-Z0-9_]{1,64}` names are honored, enforced at
three layers: Pydantic schemas (422), `RegistryService` (ValueError), and
`extract_service_token` (returns None for anything else, so stale DB rows
cannot exfiltrate after the allow-list ships).

## Alternatives Considered
- **Per-server secret vault**: correct long-term, but no vault integration
  exists yet; env vars remain the mechanism.
- **Blocklist (`DATABASE_URL`, `*_SECRET`, …)**: endless, always misses one.

## Consequences
- Positive: arbitrary env exfiltration is closed even with stale rows.
- Negative: existing `service_token_env_var` values outside the pattern must
  be renamed (one-time migration).
