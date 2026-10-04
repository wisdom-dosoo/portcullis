# ADR-012: Dual-pepper rotation without downtime

## Status
Accepted (P3)

## Context
`API_KEY_PEPPER` was baked into every Argon2 hash with no rotation path except
a maintenance window (old hashes fail closed on restart). Same for password
hashes, invite HMACs, and SSO state signatures.

## Decision
`API_KEY_PEPPER_NEXT` (optional): new hashes/HMACs use `active_pepper`
(next or current); verification tries both. Rotation is
`PEPPER=<new>, NEXT=<old>` → re-issue at leisure → drop `NEXT`.
License-key HMACs are intentionally excluded (long-lived entitlements are
re-issued, not dual-verified).

## Alternatives Considered
- **Versioned hash encoding**: cleaner, but requires a schema migration on
  every hashed table; dual-pepper needs none.
- **Maintenance window**: simpler, but downtime for every rotation.

## Consequences
- Positive: zero-downtime rotation; invalid keys cost ≤2 Argon2 verifies
  (accepted behind pre-auth rate limiting).
- Negative: during the window, a leak of *either* pepper brute-forces its
  cohort — keep windows short.
