# ADR-008: Enforce MCP session ownership in Redis

## Status
Accepted (P0)

## Context
`SessionStore.record()` was an unconditional `SET` and `matches()` was never
called on the proxy path. Any authenticated subject could claim any
`Mcp-Session-Id`, including cross-tenant sessions, and GET SSE streams skipped
RBAC entirely.

## Decision
Validate inbound `Mcp-Session-Id` ownership (`lookup` + `matches`) before any
RBAC/forward on POST and GET; fail closed (400 invalid shape, 404 unknown,
403 foreign owner). Upstream-issued ids that collide with another owner's
record return 409 instead of overwriting. `session/terminate` is rate-limited
like every other method.

## Alternatives Considered
- **Signed session cookies**: stronger, but MCP clients speak `Mcp-Session-Id`
  headers, not cookies — would break the protocol.
- **Upstream-trust (no check)**: keeps reconnects simple, but any subject can
  hijack stateful sessions.

## Consequences
- Positive: fixation and cross-tenant reuse are structurally impossible.
- Negative: clients guessing session ids get 404s instead of silent new
  sessions; they must start sessions headerless.
