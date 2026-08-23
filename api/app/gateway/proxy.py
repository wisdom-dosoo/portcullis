"""MCP JSON-RPC upstream proxy boundary."""

from __future__ import annotations

import httpx

from app.config import Settings
from app.models.orm import McpServer


class UpstreamError(Exception):
    """Raised when the upstream MCP server is unreachable or times out."""

    def __init__(self, message: str, *, status_code_override: int | None = None) -> None:
        super().__init__(message)
        self.status_code_override = status_code_override


def _build_tls_config(server: McpServer) -> dict | None:
    """Build TLS configuration dict for httpx from server mTLS settings.

    Returns None if no mTLS is configured, otherwise returns a dict with
    ssl_context or cert/verify parameters for httpx.
    """
    if not server.ssl_ca and not server.ssl_cert and not server.ssl_key:
        return None

    # For httpx, we can use the cert parameter for client certs
    # and verify parameter for CA verification
    tls_config = {}

    # Client certificate (for mTLS)
    if server.ssl_cert and server.ssl_key:
        # httpx expects (cert_path, key_path) or (cert_pem, key_pem) as bytes
        # Since we store PEM content as strings, we need to encode them
        tls_config["cert"] = (server.ssl_cert.encode(), server.ssl_key.encode())
    elif server.ssl_cert:
        # Certificate only (no key provided - invalid but handle gracefully)
        tls_config["cert"] = server.ssl_cert.encode()

    # CA certificate for verifying upstream server
    if server.ssl_ca:
        tls_config["verify"] = server.ssl_ca.encode()
    else:
        # If no CA provided but client cert is, we still need to verify something
        # Default to True (use system CA store) unless explicitly disabled
        tls_config["verify"] = True

    return tls_config


class McpProxy:
    """Thin HTTP layer that forwards JSON-RPC requests to an upstream MCP server."""

    def __init__(self, http_client: httpx.AsyncClient, settings: Settings) -> None:
        self._client = http_client
        self._settings = settings

    def _build_timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self._settings.upstream_connect_timeout_seconds,
            read=self._settings.upstream_read_timeout_seconds,
            write=self._settings.upstream_connect_timeout_seconds,
            pool=self._settings.upstream_connect_timeout_seconds,
        )

    @staticmethod
    def _build_url(upstream_url: str, path: str) -> str:
        return upstream_url.rstrip("/") + path

    async def forward(
        self,
        upstream_url: str,
        path: str,
        method: str,
        headers: dict[str, str],
        body: bytes,
        *,
        stream: bool = False,
        server: McpServer | None = None,
    ) -> httpx.Response:
        """Forward the request to the upstream MCP server.

        Args:
            upstream_url: Base URL of the upstream server (no trailing slash).
            path:         Path component to append (e.g. "/mcp" or "").
            method:       HTTP method, typically "POST" or "GET".
            headers:      Pre-sanitized headers dict.
            body:         Raw request body bytes (empty for GET).
            stream:       When True, returns a live streaming response that the
                          caller must consume (via ``aiter_bytes``) and close
                          (via ``aclose``).  When False, buffers the full body.
            server:       Optional McpServer instance for mTLS configuration.

        Returns:
            The raw httpx.Response from upstream.

        Raises:
            UpstreamError: On timeout or connection failure.
        """
        url = self._build_url(upstream_url, path)
        timeout = self._build_timeout()

        # Build TLS config if server is provided
        tls_config = _build_tls_config(server) if server else None

        try:
            if stream:
                request = self._client.build_request(
                    method=method,
                    url=url,
                    headers=headers,
                    content=body,
                )
                # For streaming with custom TLS, we need to create a new client
                # since the shared client doesn't support per-request TLS
                if tls_config:
                    async with httpx.AsyncClient(**tls_config) as tls_client:
                        return await tls_client.send(
                            request,
                            timeout=timeout,
                            stream=True,
                            follow_redirects=False,
                        )
                return await self._client.send(
                    request,
                    timeout=timeout,
                    stream=True,
                    follow_redirects=False,
                )

            if tls_config:
                # Create a new client with TLS config for this request
                async with httpx.AsyncClient(**tls_config) as tls_client:
                    response = await tls_client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        content=body,
                        timeout=timeout,
                        follow_redirects=False,
                    )
            else:
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
