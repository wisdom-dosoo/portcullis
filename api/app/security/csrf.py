"""Cookie-session CSRF enforcement (P3).

Bearer-header requests are CSRF-immune (custom header, no ambient auth), so
only cookie-authed unsafe methods are gated: when the request carries the
HttpOnly ``portcullis_auth`` cookie but no ``Authorization`` header, mutating
methods require ``X-CSRF-Token`` to match the ``portcullis_csrf`` cookie
(double-submit). Safe methods and Bearer requests pass through untouched.
"""

from __future__ import annotations

import hmac

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_AUTH_COOKIE = "portcullis_auth"
_CSRF_COOKIE = "portcullis_csrf"
_CSRF_HEADER = "x-csrf-token"


def _needs_check(request: Request) -> bool:
    if request.method not in _UNSAFE_METHODS:
        return False
    path = request.url.path
    if not (path.startswith("/v1/") or path.startswith("/auth/") or path.startswith("/mcp/")):
        return False
    if path in {"/healthz", "/metrics", "/openapi.json"}:
        return False
    if request.headers.get("authorization", "").strip():
        return False  # Bearer — not ambient auth, no CSRF possible
    return bool(request.cookies.get(_AUTH_COOKIE))


def validate_csrf(request: Request) -> bool:
    """Return True when the double-submit CSRF pair validates."""
    header = request.headers.get(_CSRF_HEADER, "")
    cookie = request.cookies.get(_CSRF_COOKIE, "")
    if not header or not cookie:
        return False
    return hmac.compare_digest(header, cookie)


class CookieCsrfMiddleware(BaseHTTPMiddleware):
    """Reject cookie-authed mutations without a valid CSRF pair (403)."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if _needs_check(request) and not validate_csrf(request):
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
        return await call_next(request)
