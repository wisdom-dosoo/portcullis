# ADR-013: Cookie-session CSRF via double-submit

## Status
Accepted (P3)

## Context
Bearer-header requests are CSRF-immune, but P0 added an HttpOnly
`portcullis_auth` cookie fallback for SSO/e-mail sessions. Cookie-authed
mutations without CSRF protection are cross-site forgeable. The frontend
already minted/sent `portcullis_csrf` — the backend never checked it.

## Decision
`CookieCsrfMiddleware`: cookie-authed unsafe methods on `/v1/*`, `/auth/*`,
`/mcp/*` require `X-CSRF-Token == portcullis_csrf` (constant-time compare).
Bearer requests and safe methods bypass. `RequestIdMiddleware` moved outermost
so rejections still carry `X-Request-Id`.

## Alternatives Considered
- **SameSite=Strict cookies only**: breaks top-level SSO redirects (Lax is
  required for the IdP round-trip).
- **Origin/Referer validation**: spoofable for non-browser clients and
  brittle behind Cloudflare; kept as defense-in-depth only on `/mcp/*`.

## Consequences
- Positive: cookie sessions are forge-proof without touching Bearer flows.
- Negative: cookie-only API clients must implement the double-submit pair
  (documented in the SSO + secrets-rotation guides).
