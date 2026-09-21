"""stdio-to-Streamable-HTTP bridge adapter for local MCP servers.

This module wraps a local stdio-based MCP server process and exposes it as
a Streamable HTTP endpoint that Portcullis can proxy to over the network.

Usage:
    python -m app.gateway.stdio_bridge --command "python my_server.py" --port 9090

The bridge spawns the subprocess, communicates via stdin/stdout using MCP's
stdio transport, and re-exposes the server's capabilities over HTTP.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import signal
import sys
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger(__name__)

bridge_app = FastAPI(title="MCP stdio-bridge", version="0.1.0")

# Module-level state for the bridge process
_bridge_process: asyncio.subprocess.Process | None = None
_bridge_command: list[str] = []
_bridge_lock = asyncio.Lock()
_pending_responses: dict[int, asyncio.Future[dict[str, Any]]] = {}
_response_counter = 0


async def start_bridge(command: list[str]) -> None:
    """Start the upstream stdio MCP server subprocess."""
    global _bridge_process, _bridge_command
    _bridge_command = command
    logger.info("stdio_bridge.starting", command=command)
    _bridge_process = await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    logger.info("stdio_bridge.started", pid=_bridge_process.pid)


async def stop_bridge() -> None:
    """Gracefully stop the upstream subprocess."""
    global _bridge_process
    if _bridge_process is None:
        return
    logger.info("stdio_bridge.stopping", pid=_bridge_process.pid)
    try:
        _bridge_process.stdin.close()  # type: ignore[union-attr]
        _bridge_process.terminate()
        await asyncio.wait_for(_bridge_process.wait(), timeout=5.0)
    except (ProcessLookupError, asyncio.TimeoutError):
        _bridge_process.kill()
    _bridge_process = None


async def send_request(request: dict[str, Any]) -> dict[str, Any]:
    """Send a JSON-RPC request to the stdio subprocess and wait for the response."""
    global _response_counter
    if _bridge_process is None or _bridge_process.stdin is None or _bridge_process.stdout is None:
        raise RuntimeError("Bridge process not running")

    request_id = request.get("id")
    if request_id is None:
        # Notification — no response expected
        line = json.dumps(request) + "\n"
        _bridge_process.stdin.write(line.encode())
        await _bridge_process.stdin.drain()
        return {}

    future: asyncio.Future[dict[str, Any]] = asyncio.get_event_loop().create_future()
    _pending_responses[request_id] = future

    line = json.dumps(request) + "\n"
    _bridge_process.stdin.write(line.encode())  # type: ignore[union-attr]
    await _bridge_process.stdin.drain()  # type: ignore[union-attr]

    try:
        return await asyncio.wait_for(future, timeout=30.0)
    except asyncio.TimeoutError:
        _pending_responses.pop(request_id, None)
        raise TimeoutError(f"No response for request id {request_id}")


async def _read_responses() -> None:
    """Background task: read JSON-RPC responses from the subprocess stdout."""
    if _bridge_process is None or _bridge_process.stdout is None:
        return
    reader = _bridge_process.stdout
    while True:
        line = await reader.readline()
        if not line:
            break
        try:
            msg = json.loads(line.decode().strip())
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        req_id = msg.get("id")
        if req_id is not None and req_id in _pending_responses:
            _pending_responses.pop(req_id).set_result(msg)  # type: ignore[union-attr]


@bridge_app.on_event("startup")
async def on_startup() -> None:
    if _bridge_command:
        await start_bridge(_bridge_command)
        asyncio.create_task(_read_responses())


@bridge_app.on_event("shutdown")
async def on_shutdown() -> None:
    await stop_bridge()


@bridge_app.post("/mcp")
async def handle_mcp(request: Request) -> JSONResponse | StreamingResponse:
    """Handle a JSON-RPC request over Streamable HTTP and forward to the stdio subprocess."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
        )

    if not isinstance(body, dict) or "jsonrpc" not in body or "method" not in body:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "id": body.get("id") if isinstance(body, dict) else None, "error": {"code": -32600, "message": "Invalid Request"}},
        )

    try:
        result = await send_request(body)
        return JSONResponse(content=result)
    except TimeoutError:
        return JSONResponse(
            status_code=504,
            content={"jsonrpc": "2.0", "id": body.get("id"), "error": {"code": -32603, "message": "Bridge timeout"}},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=502,
            content={"jsonrpc": "2.0", "id": body.get("id"), "error": {"code": -32004, "message": str(exc)}},
        )


@bridge_app.get("/healthz")
async def health() -> JSONResponse:
    alive = _bridge_process is not None and _bridge_process.returncode is None
    return JSONResponse(
        status_code=200 if alive else 503,
        content={"status": "healthy" if alive else "unhealthy"},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="MCP stdio-to-Streamable-HTTP bridge")
    parser.add_argument("--command", required=True, nargs="+", help="Command to spawn the stdio MCP server")
    parser.add_argument("--port", type=int, default=9090, help="Port to expose the HTTP endpoint on")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1 for security)")
    args = parser.parse_args()

    global _bridge_command
    _bridge_command = args.command

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    uvicorn.run(bridge_app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
