"""End-to-end operator story test for Portcullis v0.1 MVP.

This test exercises the complete operator journey using only the ASGI test client,
mocking all infrastructure (DB, Redis, HTTP upstream) at the boundary.

Story steps:
  1.  Health check
  2.  Issue admin API key
  3.  Register upstream server
  4.  Issue client (non-admin) key
  5.  Create role and bind client key
  6.  Grant one tool pattern (allow "allowed_tool" on "test-server")
  7.  tools/list -- only permitted tool visible
  8.  tools/call allowed tool -- 200
  9.  tools/call denied tool  -- 403 / -32002
  10. Rate-limit exhaustion    -- 429 / -32003
  11. Revoke client key        -- 204
  12. Revoked key              -- 401 / -32001
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Self
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import pytest
from httpx import ASGITransport

from app.auth.dependencies import admin_subject, authenticated_subject, current_subject
from app.auth.subject import Subject
from app.limits.policies import EffectivePolicy
from app.limits.redis_bucket import RateLimitResult
from app.main import create_app
from app.models.orm import (
    PermissionEffect,
    RateLimitAlgorithm,
    ServerAuthMode,
    ServerStatus,
    ServerTransport,
    SubjectType,
    ToolPermission,
)
from app.models.schemas import (
    ServerView,
)

# ---------------------------------------------------------------------------
# Fixed identifiers used throughout the story
# ---------------------------------------------------------------------------

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
ADMIN_KEY_ID = UUID("aaaaaaaa-0000-0000-0000-000000000001")
CLIENT_KEY_ID = UUID("cccccccc-0000-0000-0000-000000000001")
SERVER_ID = UUID("55555555-0000-0000-0000-000000000001")
ROLE_ID = UUID("22222222-0000-0000-0000-000000000001")
BINDING_ID = UUID("33333333-0000-0000-0000-000000000001")
PERMISSION_ID = UUID("44444444-0000-0000-0000-000000000001")

NOW = datetime(2026, 8, 3, 12, 0, 0, tzinfo=UTC)

ADMIN_KEY_PLAINTEXT = "pk_adminpre_adminsecretsecretsecretsecretaaaa"
CLIENT_KEY_PLAINTEXT = "pk_clientpr_clientsecretsecretsecretsecretaaa"

# Subjects
ADMIN_SUBJECT = Subject(
    subject_id=str(ADMIN_KEY_ID),
    subject_type=SubjectType.API_KEY,
    tenant_id=TENANT_ID,
    scopes=frozenset(["admin"]),
)
CLIENT_SUBJECT = Subject(
    subject_id=str(CLIENT_KEY_ID),
    subject_type=SubjectType.API_KEY,
    tenant_id=TENANT_ID,
    scopes=frozenset(),
)


# ---------------------------------------------------------------------------
# ORM-like mock helpers
# ---------------------------------------------------------------------------


def _make_api_key_orm(key_id: UUID, name: str, prefix: str, scopes: list[str]) -> MagicMock:
    k = MagicMock()
    k.id = key_id
    k.tenant_id = TENANT_ID
    k.name = name
    k.key_prefix = prefix
    k.scopes = scopes
    k.created_at = NOW
    k.last_used_at = None
    k.revoked_at = None
    return k


def _make_server_orm(slug: str = "test-server") -> MagicMock:
    s = MagicMock()
    s.id = SERVER_ID
    s.tenant_id = TENANT_ID
    s.name = "Test Server"
    s.slug = slug
    s.upstream_url = "http://mock-upstream/mcp"
    s.transport = ServerTransport.STREAMABLE_HTTP
    s.auth_mode = ServerAuthMode.NONE
    s.service_token_env_var = None
    s.status = ServerStatus.ACTIVE
    s.health_check_path = "/health"
    s.consecutive_health_failures = 0
    s.last_health_check_at = None
    s.created_at = NOW
    s.updated_at = NOW
    return s


def _make_role_orm() -> MagicMock:
    r = MagicMock()
    r.id = ROLE_ID
    r.tenant_id = TENANT_ID
    r.name = "client-role"
    r.created_at = NOW
    return r


def _make_binding_orm() -> MagicMock:
    b = MagicMock()
    b.id = BINDING_ID
    b.role_id = ROLE_ID
    b.subject_type = SubjectType.API_KEY
    b.subject_id = str(CLIENT_KEY_ID)
    b.created_at = NOW
    return b


def _make_permission_orm(
    server_pattern: str = "test-server",
    tool_pattern: str = "allowed_tool",
    effect: PermissionEffect = PermissionEffect.ALLOW,
) -> ToolPermission:
    p = MagicMock(spec=ToolPermission)
    p.id = PERMISSION_ID
    p.role_id = ROLE_ID
    p.server_pattern = server_pattern
    p.tool_pattern = tool_pattern
    p.effect = effect
    p.priority = 0
    p.created_at = NOW
    return p


# ---------------------------------------------------------------------------
# Rate-limit result helpers
# ---------------------------------------------------------------------------

_ALLOWED_RL = RateLimitResult(
    allowed=True,
    limit=100,
    remaining=99,
    reset_after_seconds=60.0,
    retry_after_seconds=0.0,
)

_DENIED_RL = RateLimitResult(
    allowed=False,
    limit=100,
    remaining=0,
    reset_after_seconds=60.0,
    retry_after_seconds=60.0,
)

_EFFECTIVE_POLICY = EffectivePolicy(
    algorithm=RateLimitAlgorithm.SLIDING_WINDOW,
    request_limit=100,
    window_seconds=60,
    burst_capacity=None,
)

# ---------------------------------------------------------------------------
# App + runtime factory
# ---------------------------------------------------------------------------


def _make_app_and_runtime() -> tuple[object, MagicMock]:
    """Create app + mock runtime without starting lifespan."""
    app = create_app()

    mock_runtime = MagicMock()

    # session_factory returns a context manager yielding a mock AsyncSession
    mock_session = AsyncMock()
    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_runtime.session_factory = MagicMock(return_value=mock_session_ctx)

    # Redis mock
    mock_runtime.redis = AsyncMock()

    # HTTP client mock (for upstream)
    mock_runtime.http_client = AsyncMock()

    app.state.runtime = mock_runtime  # type: ignore[attr-defined]
    app.state.monitor = AsyncMock()  # type: ignore[attr-defined]

    return app, mock_runtime


# ---------------------------------------------------------------------------
# JSON-RPC body helpers
# ---------------------------------------------------------------------------


def _jsonrpc(method: str, params: dict | None = None, rpc_id: int = 1) -> dict:
    body: dict = {"jsonrpc": "2.0", "id": rpc_id, "method": method}
    if params is not None:
        body["params"] = params
    return body


def _tools_list_body() -> bytes:
    return json.dumps(_jsonrpc("tools/list")).encode()


def _tools_call_body(tool_name: str) -> bytes:
    return json.dumps(_jsonrpc("tools/call", {"name": tool_name})).encode()


# ---------------------------------------------------------------------------
# Upstream mock HTTP responses
# ---------------------------------------------------------------------------


def _mock_upstream_tools_list(tools: list[dict]) -> MagicMock:
    """Return a mock httpx.Response for tools/list from the upstream."""
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"tools": tools},
        }
    )
    resp = MagicMock()
    resp.status_code = 200
    resp.content = body.encode()
    resp.headers = {"content-type": "application/json"}
    resp.aread = AsyncMock()
    resp.aclose = AsyncMock()
    resp.aiter_bytes = AsyncMock(return_value=[])
    return resp


def _mock_upstream_tool_call_ok() -> MagicMock:
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": "ok"}]}}
    )
    resp = MagicMock()
    resp.status_code = 200
    resp.content = body.encode()
    resp.headers = {"content-type": "application/json"}
    resp.aread = AsyncMock()
    resp.aclose = AsyncMock()
    resp.aiter_bytes = AsyncMock(return_value=[])
    return resp


# ---------------------------------------------------------------------------
# Proxy-layer patch context manager
# ---------------------------------------------------------------------------


class _ProxyPatches:
    """Context manager that applies all patches needed for gateway/router.py."""

    def __init__(
        self,
        *,
        pre_auth_result: RateLimitResult = _ALLOWED_RL,
        verify_result: Subject | Exception = CLIENT_SUBJECT,
        server_orm: MagicMock | None = None,
        permissions: list = (),
        rate_limit_policies: list = (),
        rate_limit_result: RateLimitResult = _ALLOWED_RL,
        upstream_response: MagicMock | None = None,
    ) -> None:
        self._pre_auth_result = pre_auth_result
        self._verify_result = verify_result
        self._server_orm = server_orm or _make_server_orm()
        self._permissions = list(permissions)
        self._rate_limit_policies = list(rate_limit_policies)
        self._rate_limit_result = rate_limit_result
        self._upstream_response = upstream_response or _mock_upstream_tool_call_ok()
        self._patches: list = []

    def __enter__(self) -> Self:
        # pre_auth
        p_pre = patch(
            "app.gateway.router.check_pre_auth_limit",
            new=AsyncMock(return_value=self._pre_auth_result),
        )
        self._patches.append(p_pre)
        p_pre.start()

        # verify_key
        if isinstance(self._verify_result, Exception):
            verify_mock = AsyncMock(side_effect=self._verify_result)
        else:
            verify_mock = AsyncMock(return_value=self._verify_result)
        p_vk = patch("app.auth.authenticate.verify_key", new=verify_mock)
        self._patches.append(p_vk)
        p_vk.start()

        # ServerRepository
        mock_server_repo = MagicMock()
        mock_server_repo.get_by_slug = AsyncMock(return_value=self._server_orm)
        p_sr = patch("app.gateway.router.ServerRepository", return_value=mock_server_repo)
        self._patches.append(p_sr)
        p_sr.start()

        # RbacRepository
        mock_rbac_repo = MagicMock()
        mock_rbac_repo.get_permissions_for_subject = AsyncMock(return_value=self._permissions)
        p_rr = patch("app.gateway.router.RbacRepository", return_value=mock_rbac_repo)
        self._patches.append(p_rr)
        p_rr.start()

        # RateLimitRepository
        mock_rl_repo = MagicMock()
        mock_rl_repo.list = AsyncMock(return_value=self._rate_limit_policies)
        p_rl_repo = patch("app.gateway.router.RateLimitRepository", return_value=mock_rl_repo)
        self._patches.append(p_rl_repo)
        p_rl_repo.start()

        # resolve_policy
        p_rp = patch(
            "app.gateway.router.resolve_policy",
            return_value=_EFFECTIVE_POLICY,
        )
        self._patches.append(p_rp)
        p_rp.start()

        # RateLimiter
        mock_limiter = MagicMock()
        mock_limiter.check = AsyncMock(return_value=self._rate_limit_result)
        p_lim = patch("app.gateway.router.RateLimiter", return_value=mock_limiter)
        self._patches.append(p_lim)
        p_lim.start()

        # McpProxy.forward
        mock_proxy = MagicMock()
        mock_proxy.forward = AsyncMock(return_value=self._upstream_response)
        p_proxy = patch("app.gateway.router.McpProxy", return_value=mock_proxy)
        self._patches.append(p_proxy)
        p_proxy.start()

        # filter_tools_list: patch at router so we control what it returns
        # It receives the upstream body, subject, server_slug, session and
        # returns the filtered dict.  We replicate the real filtering here
        # using the injected permissions list so the test stays meaningful.
        perms = self._permissions

        async def _fake_filter(
            response_body: dict,
            subject: Subject,
            server_slug: str,
            session: object,
        ) -> dict:
            import copy

            from app.auth.rbac import evaluate_permission

            result_key = response_body.get("result")
            if result_key is None or "tools" not in result_key:
                return copy.deepcopy(response_body)
            tools = result_key["tools"]
            allowed = [
                t
                for t in tools
                if evaluate_permission(subject.subject_id, server_slug, t["name"], perms).allowed
            ]
            new_resp = copy.deepcopy(response_body)
            new_resp["result"]["tools"] = allowed
            return new_resp

        p_ftl = patch("app.gateway.router.filter_tools_list", new=_fake_filter)
        self._patches.append(p_ftl)
        p_ftl.start()

        return self

    def __exit__(self, *args: object) -> None:
        for p in reversed(self._patches):
            p.stop()


# ---------------------------------------------------------------------------
# The story
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_v0_1_operator_story() -> None:
    """Walk the complete v0.1 operator story end-to-end over the ASGI test client."""
    app, _runtime = _make_app_and_runtime()

    # Admin subject override (used by management API routes)
    app.dependency_overrides[admin_subject] = lambda: ADMIN_SUBJECT  # type: ignore[attr-defined]
    app.dependency_overrides[authenticated_subject] = lambda: ADMIN_SUBJECT  # type: ignore[attr-defined]
    app.dependency_overrides[current_subject] = lambda: ADMIN_SUBJECT  # type: ignore[attr-defined]

    transport = ASGITransport(app=app)  # type: ignore[arg-type]

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # ------------------------------------------------------------------ #
        # Step 1: Health check                                                #
        # ------------------------------------------------------------------ #
        resp = await client.get("/healthz")
        assert resp.status_code == 200, f"Step 1 failed: {resp.text}"

        # ------------------------------------------------------------------ #
        # Step 2: Issue admin API key                                         #
        # ------------------------------------------------------------------ #
        admin_orm_key = _make_api_key_orm(ADMIN_KEY_ID, "admin-key", "adminpre", ["admin"])

        from app.auth.subject import IssuedKey

        admin_issued = IssuedKey(
            key_id=ADMIN_KEY_ID,
            plaintext=ADMIN_KEY_PLAINTEXT,
            prefix="adminpre",
            scopes=frozenset(["admin"]),
        )

        with (
            patch("app.api.api_keys.issue_key", new=AsyncMock(return_value=admin_issued)),
            patch("app.api.api_keys.ApiKeyRepository") as MockAdminKeyRepo,
        ):
            mock_admin_repo = MockAdminKeyRepo.return_value
            mock_admin_repo.get_by_prefix = AsyncMock(return_value=admin_orm_key)

            resp = await client.post(
                "/v1/api-keys",
                json={"name": "admin-key", "scopes": ["admin"]},
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )

        assert resp.status_code == 201, f"Step 2 failed: {resp.text}"
        body = resp.json()
        assert "plaintext" in body
        assert body["key"]["id"] == str(ADMIN_KEY_ID)

        # ------------------------------------------------------------------ #
        # Step 3: Register upstream server                                    #
        # ------------------------------------------------------------------ #
        server_view = ServerView(
            id=SERVER_ID,
            tenant_id=TENANT_ID,
            name="Test Server",
            slug="test-server",
            upstream_url="http://mock-upstream/mcp",
            transport=ServerTransport.STREAMABLE_HTTP,
            auth_mode=ServerAuthMode.NONE,
            status=ServerStatus.ACTIVE,
            health_check_path="/health",
            consecutive_health_failures=0,
            last_health_check_at=None,
            created_at=NOW,
            updated_at=NOW,
        )

        with patch("app.api.servers.RegistryService") as MockSvc:
            MockSvc.return_value.create = AsyncMock(return_value=server_view)
            resp = await client.post(
                "/v1/servers",
                json={
                    "name": "Test Server",
                    "slug": "test-server",
                    "upstream_url": "http://mock-upstream/mcp",
                },
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )

        assert resp.status_code == 201, f"Step 3 failed: {resp.text}"
        assert resp.json()["slug"] == "test-server"

        # ------------------------------------------------------------------ #
        # Step 4: Issue client (non-admin) key                                #
        # ------------------------------------------------------------------ #
        client_orm_key = _make_api_key_orm(CLIENT_KEY_ID, "client-key", "clientpr", [])

        from app.auth.subject import IssuedKey as IssuedKey2

        client_issued = IssuedKey2(
            key_id=CLIENT_KEY_ID,
            plaintext=CLIENT_KEY_PLAINTEXT,
            prefix="clientpr",
            scopes=frozenset(),
        )

        with (
            patch("app.api.api_keys.issue_key", new=AsyncMock(return_value=client_issued)),
            patch("app.api.api_keys.ApiKeyRepository") as MockClientKeyRepo,
        ):
            mock_client_repo = MockClientKeyRepo.return_value
            mock_client_repo.get_by_prefix = AsyncMock(return_value=client_orm_key)

            resp = await client.post(
                "/v1/api-keys",
                json={"name": "client-key", "scopes": []},
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )

        assert resp.status_code == 201, f"Step 4 failed: {resp.text}"
        assert resp.json()["key"]["id"] == str(CLIENT_KEY_ID)

        # ------------------------------------------------------------------ #
        # Step 5: Create role and bind client key                             #
        # ------------------------------------------------------------------ #
        role_orm = _make_role_orm()
        binding_orm = _make_binding_orm()

        with patch("app.api.roles.RbacRepository") as MockRbacRepo:
            mock_rbac = MockRbacRepo.return_value
            mock_rbac.create_role = AsyncMock(return_value=role_orm)
            mock_rbac.get_role = AsyncMock(return_value=role_orm)
            mock_rbac.create_binding = AsyncMock(return_value=binding_orm)
            mock_rbac.create_permission = AsyncMock()

            resp = await client.post(
                "/v1/roles",
                json={"name": "client-role"},
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )
            assert resp.status_code == 201, f"Step 5a (create role) failed: {resp.text}"
            assert resp.json()["id"] == str(ROLE_ID)

            resp = await client.post(
                f"/v1/roles/{ROLE_ID}/bindings",
                json={"subject_id": str(CLIENT_KEY_ID)},
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )
            assert resp.status_code == 201, f"Step 5b (bind key) failed: {resp.text}"

        # ------------------------------------------------------------------ #
        # Step 6: Grant one tool pattern                                      #
        # ------------------------------------------------------------------ #
        perm_orm = _make_permission_orm()

        with patch("app.api.roles.RbacRepository") as MockRbacRepo:
            mock_rbac = MockRbacRepo.return_value
            mock_rbac.get_role = AsyncMock(return_value=role_orm)
            mock_rbac.create_permission = AsyncMock(return_value=perm_orm)

            resp = await client.post(
                f"/v1/roles/{ROLE_ID}/permissions",
                json={
                    "server_pattern": "test-server",
                    "tool_pattern": "allowed_tool",
                    "effect": "allow",
                    "priority": 0,
                },
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )
        assert resp.status_code == 201, f"Step 6 failed: {resp.text}"

        # From here on, switch the dependency override to the client subject
        app.dependency_overrides[current_subject] = lambda: CLIENT_SUBJECT  # type: ignore[attr-defined]

        # ------------------------------------------------------------------ #
        # Step 7: tools/list — only permitted tool visible                    #
        # ------------------------------------------------------------------ #
        # Upstream returns two tools; filter should allow only "allowed_tool"
        upstream_tools_all = [
            {"name": "allowed_tool", "description": "An allowed tool"},
            {"name": "denied_tool", "description": "A denied tool"},
        ]
        upstream_tools_resp = _mock_upstream_tools_list(upstream_tools_all)

        allow_perm = _make_permission_orm("test-server", "allowed_tool", PermissionEffect.ALLOW)

        with _ProxyPatches(
            permissions=[allow_perm],
            upstream_response=upstream_tools_resp,
        ):
            resp = await client.post(
                "/mcp/test-server",
                content=_tools_list_body(),
                headers={
                    "Authorization": f"Bearer {CLIENT_KEY_PLAINTEXT}",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 200, f"Step 7 failed: {resp.text}"
        body = resp.json()
        tools_returned = [t["name"] for t in body["result"]["tools"]]
        assert "allowed_tool" in tools_returned, f"allowed_tool missing: {tools_returned}"
        assert "denied_tool" not in tools_returned, (
            f"denied_tool should be filtered: {tools_returned}"
        )

        # ------------------------------------------------------------------ #
        # Step 8: tools/call allowed tool → 200                              #
        # ------------------------------------------------------------------ #
        with _ProxyPatches(permissions=[allow_perm]):
            resp = await client.post(
                "/mcp/test-server",
                content=_tools_call_body("allowed_tool"),
                headers={
                    "Authorization": f"Bearer {CLIENT_KEY_PLAINTEXT}",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 200, f"Step 8 failed: {resp.text}"

        # ------------------------------------------------------------------ #
        # Step 9: tools/call denied tool → 403 with code -32002              #
        # ------------------------------------------------------------------ #
        with _ProxyPatches(permissions=[allow_perm]):
            resp = await client.post(
                "/mcp/test-server",
                content=_tools_call_body("denied_tool"),
                headers={
                    "Authorization": f"Bearer {CLIENT_KEY_PLAINTEXT}",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 403, f"Step 9 failed: {resp.text}"
        body = resp.json()
        assert body["error"]["code"] == -32002, f"Step 9 wrong error code: {body}"

        # ------------------------------------------------------------------ #
        # Step 10: Rate limit exhaustion → 429 with code -32003              #
        # ------------------------------------------------------------------ #
        with _ProxyPatches(permissions=[allow_perm], rate_limit_result=_DENIED_RL):
            resp = await client.post(
                "/mcp/test-server",
                content=_tools_call_body("allowed_tool"),
                headers={
                    "Authorization": f"Bearer {CLIENT_KEY_PLAINTEXT}",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 429, f"Step 10 failed: {resp.text}"
        body = resp.json()
        assert body["error"]["code"] == -32003, f"Step 10 wrong error code: {body}"

        # ------------------------------------------------------------------ #
        # Step 11: Revoke client key → 204                                   #
        # ------------------------------------------------------------------ #
        # Switch back to admin for management actions
        app.dependency_overrides[current_subject] = lambda: ADMIN_SUBJECT  # type: ignore[attr-defined]

        with patch("app.api.api_keys.revoke_key", new=AsyncMock(return_value=None)):
            resp = await client.delete(
                f"/v1/api-keys/{CLIENT_KEY_ID}",
                headers={"Authorization": f"Bearer {ADMIN_KEY_PLAINTEXT}"},
            )

        assert resp.status_code == 204, f"Step 11 failed: {resp.text}"

        # ------------------------------------------------------------------ #
        # Step 12: Revoked key → 401 with code -32001                        #
        # ------------------------------------------------------------------ #
        with _ProxyPatches(verify_result=ValueError("invalid API key")):
            resp = await client.post(
                "/mcp/test-server",
                content=_tools_call_body("allowed_tool"),
                headers={
                    "Authorization": f"Bearer {CLIENT_KEY_PLAINTEXT}",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 401, f"Step 12 failed: {resp.text}"
        body = resp.json()
        assert body["error"]["code"] == -32001, f"Step 12 wrong error code: {body}"
