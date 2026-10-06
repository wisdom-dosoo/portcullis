# Portcullis Skill — gateway operations via MCP + REST

Use when the user asks to register an MCP server, issue a key, grant a tool
permission, debug a `-3200x` error, or connect Claude/Cursor to the gateway.

## Workflow

1. **Discover:** `GET /.well-known/mcp.json` for routes + error codes.
2. **Health:** `GET /healthz` must be `200 {"status":"ok"}` before anything else.
3. **Register server (admin):** `POST /v1/servers {"name","slug","upstream_url","transport":"streamable_http"}`.
4. **Issue key (admin):** `POST /v1/api-keys {"name","scopes":[]}` — secret shown once.
5. **Grant access (admin):** `POST /v1/roles` → `POST /v1/roles/{id}/bindings {"subject_type":"api_key","subject_id":"<key-uuid>"}` → `POST /v1/roles/{id}/permissions {"server":"<slug>","tool_pattern":"<prefix_*>","effect":"allow"}`.
6. **Client config:** run `portcullis mcp config --server <slug> --base-url $BASE --client claude` and paste into the IDE.
7. **Dry-run first:** `POST /mcp/<slug>?dry_run=1` with the real `tools/call` body — confirms RBAC + rate limit without side effects.
8. **Call:** `POST /mcp/<slug>` with `Authorization: Bearer $PORTCULLIS_API_KEY`.

## Error recovery

- `-32001` → key wrong/revoked. Re-issue, don't retry.
- `-32002` → missing permission. Show which `{server, tool_pattern}` to request; never loop.
- `-32003` → read `Retry-After`, exponential backoff.
- `-32004` → `GET /v1/servers/<slug>` health is `unhealthy/disabled`. Report, don't retry fast.

Always send `X-Request-Id` and surface it in the reply so the operator can find the audit row.
