"""Origin header validation middleware for DNS rebinding protection."""

from __future__ import annotations

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from app.config import Environment, Settings


class OriginValidationMiddleware(BaseHTTPMiddleware):
    """Validate Origin header against allow-list for MCP proxy endpoints.

    This protects against DNS rebinding attacks by ensuring that requests
    to /mcp/* endpoints come from allowed origins. Only enforced in production.
    """

    def __init__(self, app, settings: Settings) -> None:
        super().__init__(app)
        self._settings = settings

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only apply to MCP proxy paths
        if not request.url.path.startswith("/mcp/"):
            return await call_next(request)

        # Only enforce in production
        if self._settings.environment is not Environment.PRODUCTION:
            return await call_next(request)

        # Get the Origin header
        origin = request.headers.get("origin")
        if not origin:
            # No Origin header - could be a direct API call or same-origin
            # Allow it (the same-origin policy will protect browser-based callers)
            return await call_next(request)

        # Check if origin is in allow-list
        allowed_origins = self._settings.mcp_allowed_origins_tuple
        if origin not in allowed_origins:
            # Origin not allowed - reject with 403
            return JSONResponse(
                status_code=403,
                content={"detail": f"Origin '{origin}' is not allowed"},
            )

        return await call_next(request)
