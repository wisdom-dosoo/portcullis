"use client";

import { useState, useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Wrench,
  Server as ServerIcon,
  AlertCircle,
  Hash,
  Loader2,
  Search,
  Star,
  StarOff,
  Clock,
  Lock,
  CheckCircle2,
  Play,
  ChevronRight,
  X,
  Copy,
  Check,
  BookOpen,
  MessageCircle,
  Zap,
} from "lucide-react";
import { useListServersV1ServersGet, type ServerView } from "@/api/generated";
import { getToken } from "@/lib/auth";

/* ── Types ───────────────────────────────────────────────────────────────── */

interface McpToolSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
  required?: string[];
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolSchema;
}

interface McpToolsListResult {
  result?: { tools?: McpTool[] };
  error?: { code: number; message: string };
}

interface FavEntry { serverSlug: string; toolName: string }
interface RecentEntry { serverSlug: string; toolName: string; usedAt: string }

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchToolsList(serverSlug: string): Promise<McpTool[]> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/mcp/${serverSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json: McpToolsListResult = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result?.tools ?? [];
}

function paramCount(schema?: McpToolSchema): number {
  return schema?.properties ? Object.keys(schema.properties).length : 0;
}

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("memory") || n.includes("store") || n.includes("retrieve")) return "Memory";
  if (n.startsWith("fs") || n.startsWith("file") || n.includes("read_file") || n.includes("write_file") || n.includes("directory")) return "Filesystem";
  if (n.startsWith("github") || n.startsWith("gitlab") || n.includes("repo") || n.includes("commit") || n.includes("pr_")) return "Version Control";
  if (n.startsWith("slack") || n.startsWith("discord") || n.startsWith("teams") || n.includes("send_message")) return "Messaging";
  if (n.startsWith("sqlite") || n.startsWith("postgres") || n.startsWith("mysql") || n.includes("query") || n.includes("database")) return "Database";
  if (n.startsWith("http") || n.includes("fetch") || n.includes("request") || n.includes("api_call")) return "HTTP";
  if (n.startsWith("shell") || n.includes("execute") || n.includes("run_command") || n.includes("bash")) return "Shell";
  return "General";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── Demo data (fallback when backend not available) ─────────────────────── */

const DEMO_TOOLS: McpTool[] = [
  { name: "memory/store_memory",      description: "Persist a key-value pair in the memory store for later retrieval across sessions.", inputSchema: { type: "object", properties: { key: { type: "string", description: "Unique key" }, value: { type: "string", description: "Value to store" }, ttl: { type: "number", description: "Time-to-live in seconds (optional)" } }, required: ["key", "value"] } },
  { name: "memory/retrieve_memory",   description: "Retrieve a previously stored value by key.", inputSchema: { type: "object", properties: { key: { type: "string", description: "Key to retrieve" } }, required: ["key"] } },
  { name: "memory/list_memories",     description: "List all stored memory keys with optional prefix filter.", inputSchema: { type: "object", properties: { prefix: { type: "string", description: "Optional key prefix filter" } } } },
  { name: "filesystem/read_file",     description: "Read the contents of a file at the given path.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Absolute file path" }, encoding: { type: "string", description: "File encoding", enum: ["utf-8", "base64"] } }, required: ["path"] } },
  { name: "filesystem/write_file",    description: "Write content to a file, creating it if necessary.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Destination path" }, content: { type: "string", description: "File content" }, mode: { type: "string", description: "Write mode", enum: ["overwrite", "append"] } }, required: ["path", "content"] } },
  { name: "filesystem/list_directory",description: "List files and directories at the given path.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Directory path" }, recursive: { type: "string", description: "Whether to list recursively" } }, required: ["path"] } },
  { name: "github/search_code",       description: "Search for code across GitHub repositories using a query string.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Search query" }, repo: { type: "string", description: "Limit to repository (owner/repo)" }, language: { type: "string", description: "Programming language filter" } }, required: ["query"] } },
  { name: "github/create_issue",      description: "Create a new issue in a GitHub repository.", inputSchema: { type: "object", properties: { repo: { type: "string", description: "owner/repo" }, title: { type: "string", description: "Issue title" }, body: { type: "string", description: "Issue body (markdown)" }, labels: { type: "string", description: "Comma-separated labels" } }, required: ["repo", "title"] } },
  { name: "slack/send_message",       description: "Send a message to a Slack channel or user.", inputSchema: { type: "object", properties: { channel: { type: "string", description: "Channel name or user ID" }, text: { type: "string", description: "Message text" }, blocks: { type: "string", description: "Block Kit JSON (optional)" } }, required: ["channel", "text"] } },
  { name: "sqlite/query",             description: "Execute a SQL query against the configured SQLite database.", inputSchema: { type: "object", properties: { sql: { type: "string", description: "SQL statement" }, params: { type: "string", description: "JSON array of bind parameters" } }, required: ["sql"] } },
  { name: "http/fetch",               description: "Make an HTTP request to an external URL.", inputSchema: { type: "object", properties: { url: { type: "string", description: "Target URL" }, method: { type: "string", description: "HTTP method", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] }, body: { type: "string", description: "Request body JSON" }, headers: { type: "string", description: "Headers JSON object" } }, required: ["url"] } },
  { name: "shell/run_command",        description: "Run a shell command in a sandboxed environment and return stdout/stderr.", inputSchema: { type: "object", properties: { command: { type: "string", description: "Shell command to execute" }, timeout: { type: "number", description: "Timeout in seconds (default 30)" } }, required: ["command"] } },
];

/* ── Code example generator ──────────────────────────────────────────────── */

function generateCodeExamples(tool: McpTool, serverSlug: string) {
  const params = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];
  const exampleArgs = Object.entries(params)
    .filter(([k]) => required.includes(k))
    .slice(0, 3)
    .map(([k, v]) => `"${k}": "${v.description ?? "value"}"`)
    .join(", ");

  const python = `import httpx

response = httpx.post(
    "${API_BASE}/mcp/${serverSlug}",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "${tool.name}",
            "arguments": {${exampleArgs ? `\n                ${exampleArgs}\n            ` : ""}},
        },
    },
)
result = response.json()
print(result["result"]["content"])`;

  const javascript = `const response = await fetch("${API_BASE}/mcp/${serverSlug}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "${tool.name}",
      arguments: {${exampleArgs ? ` ${exampleArgs} ` : ""}},
    },
  }),
});

const { result } = await response.json();
console.log(result.content);`;

  const curl = `curl -X POST "${API_BASE}/mcp/${serverSlug}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "${tool.name}",
      "arguments": {${exampleArgs ? `${exampleArgs}` : ""}}
    }
  }'`;

  return { python, javascript, curl };
}

/* ── Access status (demo) ────────────────────────────────────────────────── */

function getAccessStatus(toolName: string): "allowed" | "denied" | "pending" {
  if (toolName.includes("shell") || toolName.includes("run_command")) return "denied";
  if (toolName.includes("write") || toolName.includes("create")) return "pending";
  return "allowed";
}

const ACCESS_CFG = {
  allowed: { label: "Allowed",  color: "var(--pc-success)",   bg: "rgba(53,200,138,0.12)",  icon: <CheckCircle2 size={12} /> },
  denied:  { label: "Denied",   color: "var(--pc-critical)",  bg: "rgba(240,93,94,0.12)",   icon: <Lock size={12} /> },
  pending: { label: "Pending",  color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)",  icon: <Clock size={12} /> },
};

/* ── Tool Detail Drawer ──────────────────────────────────────────────────── */

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div
      style={{
        background: "#0A0F14",
        border: "1px solid var(--pc-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: "1px solid var(--pc-border)",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {lang}
        </span>
        <button
          onClick={copy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: copied ? "var(--pc-success)" : "var(--pc-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 14,
          fontSize: 11,
          lineHeight: 1.6,
          color: "#c9d1d9",
          overflowX: "auto",
          fontFamily: "monospace",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

function ToolDetailDrawer({
  tool,
  serverSlug,
  isFavorite,
  onToggleFavorite,
  onClose,
}: {
  tool: McpTool;
  serverSlug: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  const [codeTab, setCodeTab] = useState<"python" | "javascript" | "curl">("python");
  const access = getAccessStatus(tool.name);
  const accessCfg = ACCESS_CFG[access];
  const examples = generateCodeExamples(tool, serverSlug);
  const params = Object.entries(tool.inputSchema?.properties ?? {});
  const required = tool.inputSchema?.required ?? [];
  const category = inferCategory(tool.name);

  return (
    <>
      {/* backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }}
        onClick={onClose}
      />
      {/* drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          background: "var(--pc-surface)",
          borderLeft: "1px solid var(--pc-border)",
          zIndex: 51,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pc-border)",
            background: "var(--pc-elevated)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(45,212,167,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Wrench size={15} style={{ color: "var(--pc-primary)" }} />
                </div>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: "var(--pc-foreground)",
                  }}
                >
                  {tool.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--pc-muted)", background: "var(--pc-surface)", padding: "1px 7px", borderRadius: 5, border: "1px solid var(--pc-border)" }}>
                  {category}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 5,
                    background: accessCfg.bg,
                    color: accessCfg.color,
                  }}
                >
                  {accessCfg.icon}
                  {accessCfg.label}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={onToggleFavorite}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                style={{
                  padding: "6px 8px",
                  background: "transparent",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  color: isFavorite ? "var(--pc-warning)" : "var(--pc-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "6px 8px",
                  background: "transparent",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  color: "var(--pc-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Description</div>
            <p style={{ fontSize: 13, color: "var(--pc-foreground)", lineHeight: 1.65 }}>
              {tool.description ?? "No description provided."}
            </p>
          </div>

          {/* Server + support */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: 12, background: "var(--pc-elevated)", borderRadius: 8, border: "1px solid var(--pc-border)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Server</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "monospace", color: "var(--pc-secondary)" }}>
                <ServerIcon size={12} />
                {serverSlug}
              </div>
            </div>
            <div style={{ padding: 12, background: "var(--pc-elevated)", borderRadius: 8, border: "1px solid var(--pc-border)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Support</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--pc-muted)" }}>
                <MessageCircle size={12} />
                platform-team
              </div>
            </div>
          </div>

          {/* Parameters */}
          {params.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                Parameters ({params.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {params.map(([key, schema]) => (
                  <div
                    key={key}
                    style={{
                      padding: 10,
                      background: "var(--pc-elevated)",
                      borderRadius: 7,
                      border: "1px solid var(--pc-border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <code style={{ fontSize: 12, fontWeight: 700, color: "var(--pc-primary)" }}>{key}</code>
                      {required.includes(key) && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--pc-critical)", background: "rgba(240,93,94,0.1)", padding: "0px 5px", borderRadius: 4 }}>
                          required
                        </span>
                      )}
                      {schema.type && (
                        <span style={{ fontSize: 10, color: "var(--pc-muted)", marginLeft: "auto", fontFamily: "monospace" }}>
                          {schema.type}
                          {schema.enum ? ` (${schema.enum.join(" | ")})` : ""}
                        </span>
                      )}
                    </div>
                    {schema.description && (
                      <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0 }}>{schema.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Permission + Limits */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
              Permission &amp; Limits
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Access status", value: accessCfg.label, color: accessCfg.color },
                { label: "Rate limit",    value: "100 calls / minute" },
                { label: "Daily quota",   value: "10,000 calls / day" },
                { label: "Timeout",       value: "30 seconds" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "7px 0",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  <span style={{ color: "var(--pc-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, color: color ?? "var(--pc-foreground)" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Code examples */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
              Code Examples
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {(["python", "javascript", "curl"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCodeTab(tab)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    border: "1px solid var(--pc-border)",
                    background: codeTab === tab ? "var(--pc-primary)" : "transparent",
                    color: codeTab === tab ? "#0C1116" : "var(--pc-muted)",
                    cursor: "pointer",
                  }}
                >
                  {tab === "javascript" ? "JavaScript" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <CodeBlock
              code={examples[codeTab]}
              lang={codeTab === "javascript" ? "JavaScript" : codeTab === "python" ? "Python" : "curl"}
            />
          </div>

          {/* Access request */}
          {access !== "allowed" && (
            <div
              style={{
                padding: 14,
                background: "rgba(244,185,66,0.06)",
                border: "1px solid rgba(244,185,66,0.25)",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-warning)", marginBottom: 6 }}>
                {access === "denied" ? "Access denied by policy" : "Access pending approval"}
              </div>
              <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 10, lineHeight: 1.55 }}>
                {access === "denied"
                  ? "This tool has been restricted by your organization's security policy. Contact platform-team to request an exception."
                  : "Your access request is under review. You'll receive a notification when it's approved."}
              </p>
              {access === "denied" && (
                <button
                  style={{
                    padding: "6px 14px",
                    background: "rgba(244,185,66,0.12)",
                    border: "1px solid rgba(244,185,66,0.3)",
                    borderRadius: 6,
                    color: "var(--pc-warning)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Request exception
                </button>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--pc-border)",
            background: "var(--pc-elevated)",
            flexShrink: 0,
            display: "flex",
            gap: 10,
          }}
        >
          <Link
            href={`/developer/playground?server=${encodeURIComponent(serverSlug)}&tool=${encodeURIComponent(tool.name)}`}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 0",
              background: access === "allowed" ? "var(--pc-primary)" : "var(--pc-elevated)",
              border: access === "allowed" ? "none" : "1px solid var(--pc-border)",
              borderRadius: 7,
              color: access === "allowed" ? "#0C1116" : "var(--pc-muted)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Play size={14} />
            Try in Playground
          </Link>
          <Link
            href={`/developer/docs?tool=${encodeURIComponent(tool.name)}`}
            style={{
              padding: "9px 16px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "1px solid var(--pc-border)",
              borderRadius: 7,
              color: "var(--pc-muted)",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            <BookOpen size={14} />
            Docs
          </Link>
        </div>
      </div>
    </>
  );
}

/* ── Tool Card ───────────────────────────────────────────────────────────── */

function ToolCard({
  tool,
  serverSlug,
  isFavorite,
  isRecent,
  onToggleFavorite,
  onOpen,
}: {
  tool: McpTool;
  serverSlug: string;
  isFavorite: boolean;
  isRecent: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const count = paramCount(tool.inputSchema);
  const access = getAccessStatus(tool.name);
  const accessCfg = ACCESS_CFG[access];
  const category = inferCategory(tool.name);

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--pc-primary)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--pc-border)")}
      onClick={onOpen}
    >
      <div style={{ padding: 16, flex: 1 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: "var(--pc-elevated)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Wrench size={14} style={{ color: "var(--pc-primary)" }} />
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "monospace",
                color: "var(--pc-foreground)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tool.name}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: isFavorite ? "var(--pc-warning)" : "var(--pc-border)",
              padding: 2,
              flexShrink: 0,
            }}
          >
            <Star size={13} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>

        {/* badges */}
        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--pc-elevated)",
              color: "var(--pc-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {category}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 4,
              background: accessCfg.bg,
              color: accessCfg.color,
            }}
          >
            {accessCfg.icon}
            {accessCfg.label}
          </span>
          {isRecent && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(72,184,232,0.12)",
                color: "var(--pc-secondary)",
              }}
            >
              <Clock size={9} />
              Recent
            </span>
          )}
        </div>

        {/* description */}
        <p
          style={{
            fontSize: 11,
            color: "var(--pc-muted)",
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {tool.description ?? "No description provided."}
        </p>
      </div>

      {/* footer */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--pc-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--pc-muted)" }}>
          <Hash size={10} />
          {count} param{count !== 1 ? "s" : ""}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--pc-primary)" }}>
          Details <ChevronRight size={11} />
        </span>
      </div>
    </div>
  );
}

/* ── Skeleton Card ───────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div style={{ background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 16 }}>
      {[60, 90, 70].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 14 : 11,
            width: `${w}%`,
            background: "var(--pc-elevated)",
            borderRadius: 5,
            marginBottom: i < 2 ? 10 : 0,
          }}
        />
      ))}
    </div>
  );
}

/* ── Inner (uses useSearchParams) ────────────────────────────────────────── */

function ToolsInner() {
  const searchParams = useSearchParams();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    searchParams.get("server") ?? null
  );
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [favorites, setFavorites] = useState<FavEntry[]>([
    { serverSlug: "production-mcp", toolName: "memory/store_memory" },
    { serverSlug: "production-mcp", toolName: "filesystem/read_file" },
    { serverSlug: "production-mcp", toolName: "github/search_code" },
  ]);
  const [recentReferenceTime] = useState(Date.now);
  const [recentTools] = useState<RecentEntry[]>([
    { serverSlug: "production-mcp", toolName: "memory/store_memory",   usedAt: new Date(recentReferenceTime - 120_000).toISOString() },
    { serverSlug: "staging-mcp",    toolName: "filesystem/read_file",  usedAt: new Date(recentReferenceTime - 900_000).toISOString() },
    { serverSlug: "production-mcp", toolName: "github/search_code",    usedAt: new Date(recentReferenceTime - 3_600_000).toISOString() },
  ]);
  const [detailTool, setDetailTool] = useState<McpTool | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const { data: serversResp, isLoading: serversLoading } = useListServersV1ServersGet();
  const servers = (Array.isArray(serversResp?.data) ? serversResp!.data : []) as ServerView[];

  const {
    data: fetchedTools,
    isLoading: toolsLoading,
    isError: toolsError,
    error: toolsFetchError,
  } = useQuery<McpTool[], Error>({
    queryKey: ["mcp-tools", selectedSlug],
    queryFn: () => fetchToolsList(selectedSlug!),
    enabled: !!selectedSlug,
    retry: 1,
  });

  // Use demo tools if API returns nothing
  const tools: McpTool[] = useMemo(() => {
    if (!selectedSlug) return [];
    if (fetchedTools && fetchedTools.length > 0) return fetchedTools;
    if (!toolsLoading && !toolsError) return DEMO_TOOLS;
    return [];
  }, [fetchedTools, toolsLoading, toolsError, selectedSlug]);

  const categories = useMemo(() => {
    const cats = new Set(tools.map((t) => inferCategory(t.name)));
    return ["All", ...Array.from(cats).sort()];
  }, [tools]);

  const filtered = useMemo(() => {
    return tools.filter((t) => {
      const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.description ?? "").toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === "All" || inferCategory(t.name) === categoryFilter;
      const matchFav = !showFavoritesOnly || favorites.some((f) => f.serverSlug === selectedSlug && f.toolName === t.name);
      return matchSearch && matchCat && matchFav;
    });
  }, [tools, search, categoryFilter, showFavoritesOnly, favorites, selectedSlug]);

  const isFavorite = (toolName: string) =>
    favorites.some((f) => f.serverSlug === selectedSlug && f.toolName === toolName);

  const toggleFavorite = (toolName: string) => {
    if (!selectedSlug) return;
    setFavorites((prev) =>
      isFavorite(toolName)
        ? prev.filter((f) => !(f.serverSlug === selectedSlug && f.toolName === toolName))
        : [...prev, { serverSlug: selectedSlug, toolName }]
    );
  };

  const isRecent = (toolName: string) =>
    recentTools.some((r) => r.serverSlug === selectedSlug && r.toolName === toolName);

  return (
    <div style={{ color: "var(--pc-foreground)" }}>
      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Wrench size={20} style={{ color: "var(--pc-primary)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Tool Explorer</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          Browse, favorite, and test MCP tools across all connected servers
        </p>
      </div>

      {/* recently used strip */}
      {recentTools.length > 0 && (
        <div
          style={{
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>
            Recently Used
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recentTools.map((r) => (
              <button
                key={`${r.serverSlug}/${r.toolName}`}
                onClick={() => {
                  setSelectedSlug(r.serverSlug);
                  // find and open
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 9999,
                  fontSize: 11,
                  color: "var(--pc-foreground)",
                  cursor: "pointer",
                }}
              >
                <Clock size={10} style={{ color: "var(--pc-muted)" }} />
                <span style={{ fontFamily: "monospace" }}>{r.toolName}</span>
                <span style={{ color: "var(--pc-muted)" }}>·</span>
                <span style={{ color: "var(--pc-muted)" }}>{relativeTime(r.usedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* server selector */}
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 14,
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>
          Select a Server
        </p>
        {serversLoading ? (
          <div style={{ display: "flex", gap: 8 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: 32, width: 110, background: "var(--pc-elevated)", borderRadius: 9999 }} />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["production-mcp", "staging-mcp", "dev-mcp"].map((slug) => (
              <button
                key={slug}
                onClick={() => setSelectedSlug((prev) => (prev === slug ? null : slug))}
                style={{
                  background: selectedSlug === slug ? "var(--pc-primary)" : "var(--pc-elevated)",
                  border: `1px solid ${selectedSlug === slug ? "var(--pc-primary)" : "var(--pc-border)"}`,
                  color: selectedSlug === slug ? "#0C1116" : "var(--pc-foreground)",
                  borderRadius: 9999,
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: selectedSlug === slug ? 700 : 400,
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {slug}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {servers.map((s) => (
              <button
                key={s.slug}
                onClick={() => setSelectedSlug((prev) => (prev === s.slug ? null : s.slug))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: selectedSlug === s.slug ? "var(--pc-primary)" : "var(--pc-elevated)",
                  border: `1px solid ${selectedSlug === s.slug ? "var(--pc-primary)" : "var(--pc-border)"}`,
                  color: selectedSlug === s.slug ? "#0C1116" : "var(--pc-foreground)",
                  borderRadius: 9999,
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: selectedSlug === s.slug ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.status === "active" ? "var(--pc-success)" : "var(--pc-muted)", flexShrink: 0 }} />
                <span style={{ fontFamily: "monospace" }}>{s.slug}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* search + category filters + favorites toggle */}
      {selectedSlug && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
            }}
          >
            <Search size={13} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools by name or description…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--pc-foreground)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", display: "flex" }}>
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFavoritesOnly((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 12px",
              background: showFavoritesOnly ? "rgba(244,185,66,0.12)" : "transparent",
              border: `1px solid ${showFavoritesOnly ? "rgba(244,185,66,0.4)" : "var(--pc-border)"}`,
              borderRadius: 8,
              color: showFavoritesOnly ? "var(--pc-warning)" : "var(--pc-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Star size={12} fill={showFavoritesOnly ? "currentColor" : "none"} />
            Favorites
          </button>
        </div>
      )}

      {/* category filter pills */}
      {selectedSlug && categories.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: "4px 12px",
                borderRadius: 14,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${categoryFilter === cat ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: categoryFilter === cat ? "rgba(45,212,167,0.1)" : "transparent",
                color: categoryFilter === cat ? "var(--pc-primary)" : "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* tool grid */}
      {selectedSlug ? (
        toolsLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {[...Array(9)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : toolsError && (!fetchedTools || fetchedTools.length === 0) ? (
          <div
            style={{ padding: 40, textAlign: "center", background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 10 }}
          >
            <AlertCircle size={24} style={{ color: "var(--pc-critical)", margin: "0 auto 10px", display: "block" }} />
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Failed to fetch tools</p>
            <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>{(toolsFetchError as Error)?.message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{ padding: 40, textAlign: "center", background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 10 }}
          >
            <Wrench size={22} style={{ color: "var(--pc-muted)", margin: "0 auto 10px", display: "block", opacity: 0.4 }} />
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No tools match</p>
            <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>Try a different search term or category.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 12 }}>
              <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>{filtered.length}</span>
              {" "}of <span style={{ fontWeight: 600 }}>{tools.length}</span> tool{tools.length !== 1 ? "s" : ""} on{" "}
              <span style={{ fontFamily: "monospace", color: "var(--pc-primary)" }}>{selectedSlug}</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {filtered.map((tool) => (
                <ToolCard
                  key={tool.name}
                  tool={tool}
                  serverSlug={selectedSlug}
                  isFavorite={isFavorite(tool.name)}
                  isRecent={isRecent(tool.name)}
                  onToggleFavorite={() => toggleFavorite(tool.name)}
                  onOpen={() => setDetailTool(tool)}
                />
              ))}
            </div>
          </>
        )
      ) : (
        !serversLoading && (
          <div
            style={{ padding: 48, textAlign: "center", background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 10 }}
          >
            <Zap size={22} style={{ color: "var(--pc-muted)", margin: "0 auto 10px", display: "block", opacity: 0.4 }} />
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Select a server to browse tools</p>
            <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>Choose a server above to explore its available MCP tools.</p>
          </div>
        )
      )}

      {/* detail drawer */}
      {detailTool && selectedSlug && (
        <ToolDetailDrawer
          tool={detailTool}
          serverSlug={selectedSlug}
          isFavorite={isFavorite(detailTool.name)}
          onToggleFavorite={() => toggleFavorite(detailTool.name)}
          onClose={() => setDetailTool(null)}
        />
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function DeveloperToolsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "var(--pc-muted)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      }
    >
      <ToolsInner />
    </Suspense>
  );
}
