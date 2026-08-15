"""Authenticated MCP proxy integration tests against real Postgres + Redis.

The upstream MCP server is mocked with an in-process ``httpx.MockTransport`` so
the full pipeline (auth → registry → RBAC → rate-limit → forward) runs against
real database and cache containers without needing a second Docker service.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from uuid import UUID

import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.api_keys import issue_key
from app.gateway.registry import DEFAULT_TENANT_ID
from app.gateway.session import SessionStore
from app.main import create_app
from app.models.db import create_session_factory
from app.models.orm import PermissionEffect, ServerStatus, SubjectType
from app.models.schemas import ServerCreate, ServerUpdate
from app.repositories.rbac import RbacRepository
from app.repositories.servers import ServerRepository
from app.runtime import Runtime

PEER_IP = "127.0.0.1"
DEFAULT_UPSTREAM = f"http://{PEER_IP}:9000/mcp"


def _rpc(method: str, *, params: object | None = None, _id: int | None = 1) -> bytes:
    body: dict[str, object] = {"jsonrpc": "2.0", "id": _id, "method": method}
    if params is not None:
        body["params"] = params
    return json.dumps(body).encode()


def _tool(name: str) -> dict[str, object]:
    return {"name": name, "description": f"tool {name}"}


def _upstream_handler(
    request: httpx.Request,
    *,
    tools: list[dict[str, object]] | None = None,
    call_text: str = "ok",
    status: int = 200,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """Return a canned upstream JSON-RPC response based on the request method."""
    body = request.read()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        payload = {}

    if payload.get("method") == "tools/list":
        content = json.dumps(
            {"jsonrpc": "2.0", "id": payload.get("id"), "result": {"tools": tools or []}}
        ).encode()
    elif payload.get("method") == "tools/call":
        content = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": payload.get("id"),
                "result": {"content": [{"type": "text", "text": call_text}]},
            }
        ).encode()
    else:
        content = body

    return httpx.Response(
        status_code=status,
        content=content,
        headers={"content-type": "application/json", **(headers or {})},
    )


@pytest.fixture()
def app_runtime(
    async_engine: AsyncEngine,
    redis_container: str,
) -> Runtime:
    """A Runtime wired to the real test DB/Redis but a mocked upstream client."""
    session_factory = create_session_factory(async_engine)
    redis = Redis.from_url(redis_container, decode_responses=False)
    http_client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: _upstream_handler(request)),
    )
    return Runtime(
        engine=async_engine,
        session_factory=session_factory,
        redis=redis,
        http_client=http_client,
    )


async def _issue_key(
    async_engine: AsyncEngine,
    *,
    name: str = "proxy-test-key",
    scopes: list[str] | None = None,
) -> tuple[str, UUID, str]:
    """Issue a real, persisted API key.

    Returns ``(plaintext, subject_id, tenant_id)``.
    """
    scopes = scopes or ["admin"]
    factory = create_session_factory(async_engine)
    async with factory() as session:
        assert isinstance(session, AsyncSession)
        from app.config import get_settings

        issued = await issue_key(
            name=name,
            scopes=scopes,
            pepper=get_settings().api_key_pepper,
            session=session,
            tenant_id=DEFAULT_TENANT_ID,
        )
        return issued.plaintext, issued.key_id, str(DEFAULT_TENANT_ID)


async def _seed(
    async_engine: AsyncEngine,
    *,
    server_slug: str = "demo",
    upstream_url: str = DEFAULT_UPSTREAM,
    tool_names: list[str] | None = None,
    status: ServerStatus = ServerStatus.ACTIVE,
    bind: bool = True,
) -> tuple[str, UUID]:
    """Create a server, a role granting ``tool_names``, and a bound API key.

    Returns ``(plaintext, subject_id)`` ready to authenticate to the gateway.
    """
    tool_names = tool_names or ["list_dir"]
    server = ServerCreate(name="Demo", slug=server_slug, upstream_url=upstream_url)

    factory = create_session_factory(async_engine)
    async with factory() as session:
        assert isinstance(session, AsyncSession)
        servers = ServerRepository(session)
        stored = await servers.get_by_slug(DEFAULT_TENANT_ID, server_slug)
        if stored is None:
            stored = await servers.create(DEFAULT_TENANT_ID, server)
        await session.commit()
        if status is not ServerStatus.ACTIVE:
            await servers.update(stored, ServerUpdate(status=status))
            await session.commit()

    plaintext, subject_id, _ = await _issue_key(async_engine)

    async with factory() as session:
        assert isinstance(session, AsyncSession)
        rbac = RbacRepository(session)
        role = await rbac.create_role(DEFAULT_TENANT_ID, f"proxy-role-{subject_id}")
        for tool in tool_names:
            await rbac.create_permission(
                role_id=role.id,
                server_pattern=server_slug,
                tool_pattern=tool,
                effect=PermissionEffect.ALLOW,
                priority=0,
            )
        await session.commit()
        if bind:
            await rbac.create_binding(
                role_id=role.id,
                subject_id=subject_id,
                subject_type=SubjectType.API_KEY,
            )
            await session.commit()

    return plaintext, subject_id


async def _client_for(
    app_runtime: Runtime,
    *,
    handler: Callable[[httpx.Request], httpx.Response] | None = None,
) -> tuple[httpx.AsyncClient, Runtime]:
    """Return a running ASGI gateway client (and its runtime) for a test."""
    runtime = app_runtime
    if handler is not None:
        runtime = Runtime(
            engine=app_runtime.engine,
            session_factory=app_runtime.session_factory,
            redis=app_runtime.redis,
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    app = create_app()
    app.state.runtime = runtime  # type: ignore[attr-defined]
    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url=f"http://{PEER_IP}:8000",
    )
    return client, runtime


async def test_tools_list_filters_by_rbac(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    plaintext, _ = await _seed(
        async_engine,
        server_slug="t-list",
        tool_names=["allowed_tool"],
    )

    def list_handler(request: httpx.Request) -> httpx.Response:
        return _upstream_handler(
            request,
            tools=[_tool("allowed_tool"), _tool("blocked_tool")],
        )

    client, _ = await _client_for(app_runtime, handler=list_handler)
    async with client:
        resp = await client.post(
            "/mcp/t-list",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("tools/list"),
        )
    assert resp.status_code == 200
    tools = json.loads(resp.content)["result"]["tools"]
    assert [t["name"] for t in tools] == ["allowed_tool"]


async def test_tools_call_allowed_by_rbac(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    plaintext, _ = await _seed(
        async_engine,
        server_slug="t-call",
        tool_names=["list_dir"],
    )

    client, _ = await _client_for(app_runtime)
    async with client:
        resp = await client.post(
            "/mcp/t-call",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("tools/call", params={"name": "list_dir", "arguments": {}}, _id=2),
        )
    assert resp.status_code == 200
    result = json.loads(resp.content)
    assert result["result"]["content"][0]["text"] == "ok"


async def test_tools_call_denied_by_rbac(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    plaintext, _ = await _seed(
        async_engine,
        server_slug="t-deny",
        tool_names=["allowed_tool"],
    )

    client, _ = await _client_for(app_runtime)
    async with client:
        resp = await client.post(
            "/mcp/t-deny",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("tools/call", params={"name": "list_dir", "arguments": {}}, _id=2),
        )
    assert resp.status_code == 403
    assert "error" in json.loads(resp.content)


async def test_malformed_json_returns_400(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    plaintext, _ = await _seed(async_engine, server_slug="t-malformed")

    client, _ = await _client_for(app_runtime)
    async with client:
        resp = await client.post(
            "/mcp/t-malformed",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=b"{not-json",
        )
    assert resp.status_code == 400


async def test_unsupported_method_returns_404(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    plaintext, _ = await _seed(async_engine, server_slug="t-method")

    client, _ = await _client_for(app_runtime)
    async with client:
        resp = await client.post(
            "/mcp/t-method",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("bogus/method"),
        )
    assert resp.status_code == 404


async def test_unauthenticated_returns_401(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    await _seed(async_engine, server_slug="t-unauth")

    client, _ = await _client_for(app_runtime)
    async with client:
        resp = await client.post(
            "/mcp/t-unauth",
            content=_rpc("tools/list"),
        )
    assert resp.status_code == 401


async def test_disabled_server_returns_503(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    plaintext, _ = await _seed(
        async_engine,
        server_slug="t-disabled",
        status=ServerStatus.DISABLED,
    )

    client, _ = await _client_for(app_runtime)
    async with client:
        resp = await client.post(
            "/mcp/t-disabled",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("tools/list"),
        )
    assert resp.status_code == 503


async def test_strips_client_credentials(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    captured: dict[str, str] = {}

    def capture_handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers.get("authorization", "")
        return _upstream_handler(request, tools=[_tool("x")])

    plaintext, _ = await _seed(async_engine, server_slug="t-strip")

    client, _ = await _client_for(app_runtime, handler=capture_handler)
    async with client:
        resp = await client.post(
            "/mcp/t-strip",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("tools/list"),
        )
    assert resp.status_code == 200
    assert captured.get("authorization", "").strip() == ""


async def test_session_routing_persists_upstream_session_id(
    app_runtime: Runtime,
    async_engine: AsyncEngine,
) -> None:
    upstream_session = "sess-12345"

    def session_handler(request: httpx.Request) -> httpx.Response:
        return _upstream_handler(
            request,
            tools=[_tool("list_dir")],
            headers={"mcp-session-id": upstream_session},
        )

    plaintext, _ = await _seed(
        async_engine,
        server_slug="t-session",
        tool_names=["list_dir"],
    )

    client, runtime = await _client_for(app_runtime, handler=session_handler)
    async with client:
        resp = await client.post(
            "/mcp/t-session",
            headers={"Authorization": f"Bearer {plaintext}"},
            content=_rpc("tools/list"),
        )
    assert resp.status_code == 200
    assert resp.headers.get("mcp-session-id") == upstream_session

    store = SessionStore(runtime.redis)
    record = await store.lookup(upstream_session)
    assert record is not None
    assert record["tenant_id"] == str(DEFAULT_TENANT_ID)
    assert record["server_slug"] == "t-session"
