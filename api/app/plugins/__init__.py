"""Plugin system for Portcullis - extensible middleware pipeline."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

from fastapi import Request, Response


class PluginPhase(Enum):
    """Where in the request lifecycle the plugin runs."""

    PRE_AUTH = "pre_auth"          # Before authentication
    POST_AUTH = "post_auth"        # After auth, before RBAC
    PRE_RATE_LIMIT = "pre_rate_limit"  # Before rate limiting
    POST_RATE_LIMIT = "post_rate_limit"  # After rate limiting
    PRE_UPSTREAM = "pre_upstream"  # Before forwarding to upstream
    POST_UPSTREAM = "post_upstream"  # After receiving upstream response
    PRE_RESPONSE = "pre_response"  # Before returning to client


@dataclass(frozen=True)
class PluginContext:
    """Context passed to plugins during execution."""

    request: Request
    response: Response | None = None
    phase: PluginPhase = PluginPhase.PRE_AUTH
    metadata: dict[str, Any] | None = None

    def with_response(self, response: Response) -> PluginContext:
        return PluginContext(
            request=self.request,
            response=response,
            phase=self.phase,
            metadata=self.metadata,
        )

    def with_phase(self, phase: PluginPhase) -> PluginContext:
        return PluginContext(
            request=self.request,
            response=self.response,
            phase=phase,
            metadata=self.metadata,
        )


class Plugin(ABC):
    """Base class for all plugins."""

    name: str
    version: str = "1.0.0"
    phase: PluginPhase = PluginPhase.PRE_AUTH
    priority: int = 0  # Lower runs first

    @abstractmethod
    async def execute(self, context: PluginContext) -> PluginContext | Response:
        """Execute the plugin logic.

        Returns:
            - Modified PluginContext to continue pipeline
            - Response to short-circuit and return immediately
        """

    async def on_error(self, context: PluginContext, error: Exception) -> Response | None:
        """Handle errors from this plugin or downstream.

        Returns None to propagate error, or a Response to handle it.
        """
        return None


class HTTPPlugin(Plugin):
    """HTTP-based plugin that calls an external service."""

    def __init__(
        self,
        name: str,
        url: str,
        phase: PluginPhase,
        timeout: float = 5.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self.url = url
        self.phase = phase
        self.timeout = timeout
        self.headers = headers or {}
        import httpx
        self._client = httpx.AsyncClient(timeout=timeout)

    async def execute(self, context: PluginContext) -> PluginContext | Response:
        import httpx

        payload = {
            "request": {
                "method": context.request.method,
                "url": str(context.request.url),
                "headers": dict(context.request.headers),
                "body": None,  # Would need to read body
            },
            "metadata": context.metadata or {},
        }

        try:
            response = await self._client.post(
                self.url,
                json=payload,
                headers=self.headers,
            )
            if response.status_code == 200:
                _ = response.json()
                # Allow plugin to modify request/response via result
                return context
            return context
        except (httpx.RequestError, httpx.HTTPStatusError):
            return context

    async def close(self) -> None:
        await self._client.aclose()


class WasmPlugin(Plugin):
    """WebAssembly-based plugin for sandboxed execution."""

    def __init__(
        self,
        name: str,
        wasm_path: str,
        phase: PluginPhase,
    ):
        self.name = name
        self.wasm_path = wasm_path
        self.phase = phase
        self._instance: Any = None
        self._init_wasm()

    def _init_wasm(self):
        # Placeholder for wasmtime/wasmer integration
        # Would load .wasm file and instantiate with WASI
        pass

    async def execute(self, context: PluginContext) -> PluginContext | Response:
        # Placeholder: call Wasm function with context
        # Return modified context or response
        return context


class PluginRegistry:
    """Registry for managing and executing plugins."""

    def __init__(self):
        self._plugins: dict[PluginPhase, list[Plugin]] = {
            phase: [] for phase in PluginPhase
        }

    def register(self, plugin: Plugin) -> None:
        """Register a plugin."""
        self._plugins[plugin.phase].append(plugin)
        # Sort by priority (lower runs first)
        self._plugins[plugin.phase].sort(key=lambda p: p.priority)

    def unregister(self, plugin_name: str) -> bool:
        """Unregister a plugin by name."""
        for phase in PluginPhase:
            plugins = self._plugins[phase]
            for i, plugin in enumerate(plugins):
                if plugin.name == plugin_name:
                    plugins.pop(i)
                    return True
        return False

    def get_plugins(self, phase: PluginPhase) -> list[Plugin]:
        """Get all plugins for a phase."""
        return list(self._plugins[phase])

    async def execute_phase(
        self,
        phase: PluginPhase,
        context: PluginContext,
    ) -> PluginContext | Response:
        """Execute all plugins for a phase in order."""
        for plugin in self._plugins[phase]:
            try:
                result = await plugin.execute(context.with_phase(phase))
                if isinstance(result, Response):
                    return result
                context = result
            except Exception as e:
                error_response = await plugin.on_error(context, e)
                if error_response is not None:
                    return error_response
                raise
        return context

    async def close(self):
        """Close all plugins with cleanup."""
        for phase in PluginPhase:
            for plugin in self._plugins[phase]:
                if hasattr(plugin, "close"):
                    await plugin.close()


# Global registry instance
_plugin_registry: PluginRegistry | None = None


def get_plugin_registry() -> PluginRegistry:
    global _plugin_registry
    if _plugin_registry is None:
        _plugin_registry = PluginRegistry()
    return _plugin_registry


def register_plugin(plugin: Plugin) -> None:
    get_plugin_registry().register(plugin)


# Built-in plugins
class RequestLoggingPlugin(Plugin):
    """Logs request/response details."""

    name = "request_logging"
    phase = PluginPhase.PRE_AUTH
    priority = -100  # Run first

    async def execute(self, context: PluginContext) -> PluginContext:
        import structlog
        logger = structlog.get_logger("plugin.request_logging")
        logger.info(
            "request",
            method=context.request.method,
            path=context.request.url.path,
            client=context.request.client.host if context.request.client else None,
        )
        return context


class SecurityHeadersPlugin(Plugin):
    """Adds security headers to responses."""

    name = "security_headers"
    phase = PluginPhase.PRE_RESPONSE
    priority = 100  # Run late, before response sent

    async def execute(self, context: PluginContext) -> PluginContext:
        if context.response:
            context.response.headers.setdefault("X-Content-Type-Options", "nosniff")
            context.response.headers.setdefault("X-Frame-Options", "DENY")
            context.response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            context.response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=()")
        return context


class RequestSizeLimitPlugin(Plugin):
    """Enforces request body size limits per endpoint."""

    name = "request_size_limit"
    phase = PluginPhase.PRE_AUTH
    priority = -50

    def __init__(self, max_size: int = 1024 * 1024):  # 1MB default
        self.max_size = max_size

    async def execute(self, context: PluginContext) -> PluginContext | Response:
        content_length = context.request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body exceeds {self.max_size} bytes"},
            )
        return context


# Auto-register built-in plugins
def register_builtin_plugins():
    registry = get_plugin_registry()
    registry.register(RequestLoggingPlugin())
    registry.register(SecurityHeadersPlugin())
    registry.register(RequestSizeLimitPlugin())