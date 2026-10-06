# AGENTS.md — How AI agents use Portcullis

Portcullis is a multi-tenant MCP gateway. Agents talk to **one** base URL instead of N upstream servers.

## 1. Discover

```
GET /.well-known/mcp.json
GET /.well-known/oauth-protected-resource
GET /openapi.json
GET /healthz
```

`/.well-known/mcp.json` gives you the proxy route, auth modes, error codes, and a copy-paste `mcpServers` hint.

## 2. Configure (Claude Desktop / Cursor / Cline / Windsurf)

Generate a snippet — no dashboard needed:

```bash
export PORTCULLIS_API_KEY=pk_live_...
portcullis mcp config --server github-mcp --base-url https://gateway.example.com --client claude
```

Paste into `claude_desktop_config.json` / `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "github-mcp": {
  "url": "https://gateway.example.com/mcp/github-mcp",
  "transport": "streamable_http",
  "headers": { "Authorization": "Bearer $PORTCULLIS_API_KEY" }
} } }
```

## 3. Call tools

Standard Streamable HTTP JSON-RPC:

```bash
curl -X POST $BASE/mcp/github-mcp \
 -H "Authorization: Bearer $PORTCULLIS_API_KEY" \
 -H "Content-Type: application/json" \
 -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"github_list_issues","arguments":{}}}'
```

`tools/list` is RBAC-filtered: you only see tools you may call. Don't retry hidden tools.

## 4. Debug without burning context

| Code | Meaning | Fix |
|------|---------|-----|
| `-32001` | bad/missing credential | re-issue key, check `Authorization: Bearer` |
| `-32002` | RBAC deny | request a role binding for `{server, tool}` — do NOT retry in a loop |
| `-32003` | rate limited | honor `Retry-After`, back off |
| `-32004` | upstream down | check `GET /v1/servers/{slug}` health |

Dry-run explains the decision without executing the tool:

```bash
curl -X POST "$BASE/mcp/github-mcp?dry_run=1" ... # -> {"result":{"allowed":true,...}}
```

Send `X-Request-Id: <uuid>` on every call — it is echoed back and appears in the audit log.

## 5. Rules for agents

1. Never hardcode keys. Read `$PORTCULLIS_API_KEY`.
2. Never retry `-32002` — escalate to a human / request policy.
3. Honor `RateLimit-Remaining` + `Retry-After`.
4. Pin `Mcp-Session-Id` across multi-turn calls to the same server.
5. Keep payloads < 1MiB (`max_request_body_bytes` default).
