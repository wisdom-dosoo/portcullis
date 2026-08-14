"""MCP JSON-RPC upstream proxy boundary."""

from __future__ import annotations

import httpx

from app.config import Settings


class UpstreamError(Exception):
    """Raised when the upstream MCP server is unreachable or times out."""


class McpProxy:
    """Thin HTTP layer that forwards JSON-RPC requests to an upstream MCP server."""

    def __init__(self, http_client: httpx.AsyncClient, settings: Settings) -> None:
        self._client = http_client
        self._settings = settings

    async def forward(
        self,
        upstream_url: str,
        path: str,
        method: str,
        headers: dict[str, str],
        body: bytes,
    ) -> httpx.Response:
        """Forward the request to the upstream MCP server.

        Args:
            upstream_url: Base URL of the upstream server (no trailing slash).
            path:         Path component to append (e.g. "/mcp" or "").
            method:       HTTP method, typically "POST".
            headers:      Pre-sanitized headers dict.
            body:         Raw request body bytes.

        Returns:
            The raw httpx.Response from upstream.

        Raises:
            UpstreamError: On timeout or connection failure.
        """
        url = upstream_url.rstrip("/") + path

        timeout = httpx.Timeout(
            connect=self._settings.upstream_connect_timeout_seconds,
            read=self._settings.upstream_read_timeout_seconds,
            write=self._settings.upstream_connect_timeout_seconds,
            pool=self._settings.upstream_connect_timeout_seconds,
        )

        try:
            response = await self._client.request(
                method=method,
                url=url,
                headers=headers,
                content=body,
                timeout=timeout,
                follow_redirects=False,
            )
        except httpx.TimeoutException as exc:
            raise UpstreamError(f"Upstream timed out: {exc}") from exc
        except httpx.ConnectError as exc:
            raise UpstreamError(f"Could not connect to upstream: {exc}") from exc

        return response
