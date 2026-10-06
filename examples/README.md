# examples — 5-minute agent wins

## 1. Claude Desktop → Portcullis → mock GitHub MCP

```bash
# terminal 1: gateway + deps
docker compose up --build postgres redis portcullis
portcullis admin-key create --name demo  # save pk_live_...
export PORTCULLIS_API_KEY=pk_live_...

# register a mock upstream (python -m mcp server, or any Streamable HTTP stub)
curl -X POST http://localhost:8080/v1/servers \
 -H "Authorization: Bearer $PORTCULLIS_API_KEY" \
 -H "Content-Type: application/json" \
 -d '{"name":"GitHub demo","slug":"github-mcp","upstream_url":"http://host.docker.internal:9000/mcp","transport":"streamable_http"}'

# generate IDE config — no dashboard clicks
portcullis mcp config --server github-mcp --base-url http://localhost:8080 --client claude
# paste into claude_desktop_config.json, restart Claude, ask: "list my github tools"
```

## 2. Cursor (`~/.cursor/mcp.json`)

```bash
portcullis mcp config --server github-mcp --base-url https://gw.example.com --client cursor
```

## 3. LangGraph agent (Python)

```python
import httpx
BASE="https://gw.example.com"; KEY="pk_live_..."
r=httpx.post(f"{BASE}/mcp/github-mcp?dry_run=1",
 headers={"Authorization":f"Bearer {KEY}"},
 json={"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"github_list_issues","arguments":{}}})
assert r.json()["result"]["allowed"], r.json()
# then the real call without ?dry_run=1
```

## 4. Dry-run policy check (any tool)

```bash
curl -X POST "$BASE/mcp/github-mcp?dry_run=1" \
 -H "Authorization: Bearer $PORTCULLIS_API_KEY" \
 -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x","arguments":{}}}'
```

See `AGENTS.md` for the full agent contract and `SKILL.md` for the operator skill.
