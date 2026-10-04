"""MCP JSON-RPC upstream proxy boundary."""

from __future__ import annotations

import ssl
import tempfile

import httpx

from app.config import Settings
from app.models.orm import McpServer


class UpstreamError(Exception):
    """Raised when the upstream MCP server is unreachable or times out."""

    def __init__(self, message: str, *, status_code_override: int | None = None) -> None:
        super().__init__(message)
        self.status_code_override = status_code_override


def _build_ssl_context(server: McpServer) -> ssl.SSLContext | None:
    """Build an SSLContext from server mTLS PEM material.

    P0: httpx does not accept PEM *bytes* for ``cert``/``verify`` — the old
    code passed ``(cert_bytes, key_bytes)`` which raised per-request. Build a
    real ``SSLContext`` (CA via cadata, client chain via temp files).
    Returns None when no mTLS is configured.
    """
    if not server.ssl_ca and not server.ssl_cert and not server.ssl_key:
        return None
    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    if server.ssl_ca:
        ctx.load_verify_locations(cadata=server.ssl_ca)
    if server.ssl_cert and server.ssl_key:
        with (
            tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as cert_f,
            tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as key_f,
        ):
            cert_f.write(server.ssl_cert)
            key_f.write(server.ssl_key)
            cert_path, key_path = cert_f.name, key_f.name
        try:
            ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)
        finally:
            import os as _os

            for path in (cert_path, key_path):
                try:
                    _os.unlink(path)
                except OSError:
                    pass
    elif server.ssl_cert:
        # Cert without key is invalid; fail closed at call time via UpstreamError.
        raise UpstreamError("Upstream mTLS misconfigured: cert without key")
    return ctx


def _build_tls_config(server: McpServer) -> dict | None:
    """Build httpx TLS kwargs from server mTLS settings (SSLContext-based)."""
    ctx = _build_ssl_context(server)
    if ctx is None:
        return None
    return {"verify": ctx}


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
                # For streaming with custom TLS, we need a dedicated client
                # since the shared client doesn't support per-request TLS.
                # P0: do not close the client before the caller consumes the
                # stream — wrap aclose to also close the dedicated client.
                if tls_config:
                    tls_client = httpx.AsyncClient(
                        timeout=timeout, follow_redirects=False, **tls_config
                    )
                    try:
                        resp = await tls_client.send(request, stream=True)
                    except Exception:
                        await tls_client.aclose()
                        raise
                    orig_aclose = resp.aclose

                    async def _aclose_and_client() -> None:
                        try:
                            await orig_aclose()
                        finally:
                            await tls_client.aclose()

                    resp.aclose = _aclose_and_client  # type: ignore[method-assign]
                    return resp
                return await self._client.send(
                    request,
                    timeout=timeout,
                    stream=True,
                    follow_redirects=False,
                )

            if tls_config:
                # P0: buffered mTLS path uses SSLContext (bytes crashed).
                async with httpx.AsyncClient(
                    timeout=timeout, follow_redirects=False, **tls_config
                ) as tls_client:
                    response = await tls_client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        content=body,
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
        except UpstreamError:
            raise
        except httpx.TimeoutException as exc:
            raise UpstreamError(f"Upstream timed out: {exc}") from exc
        except httpx.ConnectError as exc:
            raise UpstreamError(f"Could not connect to upstream: {exc}") from exc
        except httpx.HTTPError as exc:
            # P0: map all transport errors (Read/Write/RemoteProtocol/Proxy)
            # to 502 instead of bubbling to 500 INTERNAL_ERROR.
            raise UpstreamError(f"Upstream transport error: {exc}") from exc

        return response
