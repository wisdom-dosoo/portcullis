"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  ChevronDown,
  ChevronRight,
  Code2,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  SplitSquareHorizontal,
  EyeOff,
  Eye,
  Link as LinkIcon,
  Terminal,
  Braces,
  Hash,
  Info,
  Server as ServerIcon,
  Zap,
  GitCompare,
  User,
  Activity,
} from "lucide-react";
import { useListServersV1ServersGet, type ServerView } from "@/api/generated";
import { getToken } from "@/lib/auth";

/* ── types ───────────────────────────────────────────────────────── */

interface JsonSchemaProp {
  type?: string;
  description?: string;
  enum?: string[];
  items?: unknown;
  properties?: Record<string, JsonSchemaProp>;
}

interface McpToolInputSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
}

interface RunResult {
  raw: unknown;
  durationMs: number;
  ok: boolean;
  outcome?: "allowed" | "denied";
  traceId?: string;
  serverSlug: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: string;
}

type InputMode = "form" | "json";
type RiskLevel = "low" | "medium" | "high" | "critical";

/* ── constants ───────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const RISK: Record<RiskLevel, { label: string; bg: string; color: string; border: string }> = {
  critical: { label: "Critical", bg: "rgba(240,93,94,0.08)", color: "#F05D5E", border: "rgba(240,93,94,0.3)" },
  high:     { label: "High",     bg: "rgba(244,185,66,0.08)", color: "#F4B942", border: "rgba(244,185,66,0.3)" },
  medium:   { label: "Medium",   bg: "rgba(72,184,232,0.08)", color: "#48B8E8", border: "rgba(72,184,232,0.3)" },
  low:      { label: "Low",      bg: "rgba(53,200,138,0.08)", color: "#35C88A", border: "rgba(53,200,138,0.3)" },
};

/* ── helpers ─────────────────────────────────────────────────────── */

function getRisk(name: string): RiskLevel {
  const n = name.toLowerCase();
  if (/delete|drop|destroy|truncate|purge|wipe|remove|kill/.test(n)) return "critical";
  if (/create|write|update|modify|patch|post|insert|execute|run|send/.test(n)) return "high";
  if (/search|query|list|find/.test(n)) return "medium";
  return "low";
}

function isSensitiveKey(key: string) {
  return /password|secret|token|key|credential|auth|api_key|private/i.test(key);
}

function buildArgs(
  tool: McpTool,
  fieldValues: Record<string, string>,
  jsonText: string,
  mode: InputMode,
): Record<string, unknown> | null {
  if (mode === "json") {
    try { return JSON.parse(jsonText); }
    catch { return null; }
  }
  const args: Record<string, unknown> = {};
  const props = tool.inputSchema?.properties ?? {};
  for (const [key, schema] of Object.entries(props)) {
    const raw = fieldValues[key] ?? "";
    if (raw === "" && !tool.inputSchema?.required?.includes(key)) continue;
    const t = (schema as JsonSchemaProp).type ?? "string";
    if (t === "boolean") args[key] = raw === "true";
    else if (t === "number" || t === "integer") args[key] = raw === "" ? 0 : Number(raw);
    else if (t === "object" || t === "array") { try { args[key] = JSON.parse(raw); } catch { args[key] = raw; } }
    else args[key] = raw;
  }
  return args;
}

function redactArgs(args: Record<string, unknown>, redact: boolean): Record<string, unknown> {
  if (!redact) return args;
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, isSensitiveKey(k) ? "[REDACTED]" : v])
  );
}

async function fetchToolsList(slug: string): Promise<McpTool[]> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/mcp/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "MCP error");
  return json.result?.tools ?? [];
}

async function execTool(
  slug: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  extraHeaders: Record<string, string>,
  simulatedSubject?: string,
): Promise<RunResult> {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(simulatedSubject ? { "X-Simulate-Subject": simulatedSubject } : {}),
      ...extraHeaders,
    };
    const res = await fetch(`${API_BASE}/mcp/${slug}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      signal: controller.signal,
    });
    const durationMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const raw = await res.json();
    const ok = !raw.error;
    return {
      raw,
      durationMs,
      ok,
      outcome: ok ? "allowed" : "denied",
      traceId: res.headers.get("x-trace-id") ?? undefined,
      serverSlug: slug,
      toolName: name,
      args,
      timestamp: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

function generateCurl(slug: string, name: string, args: Record<string, unknown>): string {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, null, 2);
  return `curl -X POST "${API_BASE}/mcp/${slug}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -d '${body}'`;
}

function generatePython(slug: string, name: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args, null, 4).split("\n").join("\n    ");
  return `import requests

response = requests.post(
    "${API_BASE}/mcp/${slug}",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer <YOUR_TOKEN>",
    },
    json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "${name}",
            "arguments": ${argsJson},
        },
    },
)
result = response.json()
print(result)`;
}

function generateTypeScript(slug: string, name: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args, null, 2).split("\n").join("\n  ");
  return `const response = await fetch("${API_BASE}/mcp/${slug}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer <YOUR_TOKEN>",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "${name}",
      arguments: ${argsJson},
    },
  }),
});
const result = await response.json();
console.log(result);`;
}

/* ── property input ──────────────────────────────────────────────── */

const inputCss: React.CSSProperties = {
  background: "var(--pc-elevated)",
  border: "1px solid var(--pc-border)",
  color: "var(--pc-foreground)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function PropertyInput({
  propKey,
  schema,
  required,
  value,
  onChange,
  redact,
}: {
  propKey: string;
  schema: JsonSchemaProp;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  redact: boolean;
}) {
  const t = schema.type ?? "string";
  const sensitive = isSensitiveKey(propKey);
  const [show, setShow] = useState(!sensitive);

  const label = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-muted)", fontFamily: "monospace" }}>
        {propKey}{required && <span style={{ color: "#F05D5E", marginLeft: 3 }}>*</span>}
      </label>
      {schema.type && (
        <span style={{ fontSize: 10, background: "rgba(72,184,232,0.12)", color: "#48B8E8", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
          {schema.type}
        </span>
      )}
      {sensitive && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 0 }}
        >
          {show ? <EyeOff size={11} strokeWidth={2} /> : <Eye size={11} strokeWidth={2} />}
        </button>
      )}
    </div>
  );

  if (schema.enum) {
    return (
      <div>
        {label}
        {schema.description && <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>{schema.description}</p>}
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputCss, cursor: "pointer" }}>
          <option value="">Select…</option>
          {schema.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  }

  if (t === "boolean") {
    return (
      <div>
        {label}
        {schema.description && <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>{schema.description}</p>}
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputCss, cursor: "pointer" }}>
          <option value="">Select…</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    );
  }

  if (t === "number" || t === "integer") {
    return (
      <div>
        {label}
        {schema.description && <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>{schema.description}</p>}
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} style={inputCss}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </div>
    );
  }

  if (t === "object" || t === "array") {
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        {label}
        {schema.description && <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>{schema.description}</p>}
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
          placeholder={t === "array" ? "[]" : "{}"}
          style={{ ...inputCss, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </div>
    );
  }

  const displayValue = (redact && sensitive && !show) ? "••••••••" : value;
  const isPassword = sensitive && !show;

  return (
    <div>
      {label}
      {schema.description && <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>{schema.description}</p>}
      {isPassword ? (
        <input type="password" value={displayValue} onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${propKey}…`} style={inputCss}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
          placeholder={`Enter ${propKey}…`}
          style={{ ...inputCss, resize: "vertical", fontFamily: propKey.toLowerCase().includes("json") ? "monospace" : "inherit" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      )}
    </div>
  );
}

/* ── confirmation modal ──────────────────────────────────────────── */

function ConfirmModal({
  tool,
  onConfirm,
  onCancel,
}: {
  tool: McpTool;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const expected = tool.name;
  const risk = getRisk(tool.name);
  const cfg = RISK[risk];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--pc-surface)",
          border: `1px solid ${cfg.border}`,
          borderRadius: 20,
          padding: 32,
          maxWidth: 440,
          width: "90%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ShieldAlert size={22} style={{ color: cfg.color }} strokeWidth={1.5} />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--pc-foreground)", margin: 0 }}>
              {risk === "critical" ? "Destructive Operation" : "Elevated Risk Tool"}
            </p>
            <p style={{ fontSize: 12, color: cfg.color, margin: 0 }}>{cfg.label} risk level</p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: "var(--pc-muted)", lineHeight: 1.65, marginBottom: 16 }}>
          This tool performs {risk === "critical" ? "destructive operations that may be irreversible" : "state-modifying operations"}. Ensure you are testing in the correct environment before proceeding.
        </p>

        <div style={{ background: "var(--pc-elevated)", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>Audit notice</p>
          <p style={{ fontSize: 12, color: "var(--pc-foreground)", margin: 0 }}>
            This execution will be recorded in the audit log with your identity and timestamp.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 8 }}>
            Type <code style={{ color: cfg.color, fontFamily: "monospace", fontWeight: 700 }}>{expected}</code> to confirm:
          </p>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && typed === expected && onConfirm()}
            placeholder={expected}
            style={{
              ...inputCss,
              borderColor: typed === expected ? "#35C88A" : "var(--pc-border)",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel}
            style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== expected}
            style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: typed === expected ? cfg.color : "var(--pc-elevated)",
              color: typed === expected ? "#0C1116" : "var(--pc-muted)",
              fontSize: 13, fontWeight: 600, cursor: typed === expected ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}>
            Execute Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── code snippet modal ──────────────────────────────────────────── */

type SnippetLang = "curl" | "python" | "typescript";

function CodeModal({
  slug,
  tool,
  args,
  onClose,
}: {
  slug: string;
  tool: McpTool;
  args: Record<string, unknown>;
  onClose: () => void;
}) {
  const [lang, setLang] = useState<SnippetLang>("curl");
  const code =
    lang === "curl" ? generateCurl(slug, tool.name, args) :
    lang === "python" ? generatePython(slug, tool.name, args) :
    generateTypeScript(slug, tool.name, args);

  function copy() {
    copyToClipboard(code).then((ok) => { if (ok) toast.success("Copied to clipboard"); });
  }

  const langs: { id: SnippetLang; label: string }[] = [
    { id: "curl", label: "cURL" },
    { id: "python", label: "Python" },
    { id: "typescript", label: "TypeScript" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 20, width: 640, maxWidth: "95vw", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {langs.map((l) => (
              <button key={l.id} onClick={() => setLang(l.id)}
                style={{ padding: "5px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: lang === l.id ? "rgba(45,212,167,0.15)" : "transparent",
                  color: lang === l.id ? "var(--pc-primary)" : "var(--pc-muted)" }}>
                {l.label}
              </button>
            ))}
          </div>
          <button onClick={copy} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}>
            <Copy size={12} strokeWidth={2} /> Copy
          </button>
        </div>
        <pre style={{ margin: 0, padding: 20, fontSize: 12, fontFamily: "monospace", color: "var(--pc-foreground)", overflowX: "auto", whiteSpace: "pre", lineHeight: 1.65, maxHeight: 480, overflowY: "auto" }}>
          {code}
        </pre>
      </div>
    </div>
  );
}

/* ── saved example ───────────────────────────────────────────────── */

interface SavedExample {
  id: string;
  label: string;
  toolName: string;
  serverSlug: string;
  args: Record<string, unknown>;
  savedAt: string;
}

/* ── inner playground ────────────────────────────────────────────── */

function PlaygroundInner() {
  const searchParams = useSearchParams();

  /* selectors */
  const [serverSlug, setServerSlug] = useState(searchParams.get("server") ?? "");
  const [toolName, setToolName] = useState(searchParams.get("tool") ?? "");
  const [loadedTool, setLoadedTool] = useState<McpTool | null>(null);

  /* form state */
  const [mode, setMode] = useState<InputMode>("form");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [jsonText, setJsonText] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  /* advanced options */
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [extraHeadersText, setExtraHeadersText] = useState("");
  const [simulatedSubject, setSimulatedSubject] = useState("");
  const [policySimMode, setPolicySimMode] = useState(false);
  const [environment, setEnvironment] = useState<"production" | "staging" | "development" | "local">("development");

  /* safety */
  const [showConfirm, setShowConfirm] = useState(false);
  const [redact, setRedact] = useState(true);

  /* execution */
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [compareResult, setCompareResult] = useState<RunResult | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  /* UI extras */
  const [showCode, setShowCode] = useState(false);
  const [savedExamples, setSavedExamples] = useState<SavedExample[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  /* data */
  const { data: serversResp, isLoading: serversLoading } = useListServersV1ServersGet();
  const servers = (serversResp?.data ?? []) as ServerView[];

  const { data: tools, isLoading: toolsLoading } = useQuery<McpTool[], Error>({
    queryKey: ["mcp-tools", serverSlug],
    queryFn: () => fetchToolsList(serverSlug),
    enabled: !!serverSlug,
    retry: 1,
    staleTime: 60_000,
  });

  /* auto-load from URL params */
  useEffect(() => {
    const p = searchParams.get("server");
    const t = searchParams.get("tool");
    if (p) setServerSlug(p);
    if (t) setToolName(t);
  }, [searchParams]);

  /* auto-load tool when tools arrive */
  useEffect(() => {
    if (tools && toolName) {
      const found = tools.find((t) => t.name === toolName);
      if (found) {
        setLoadedTool(found);
        setFieldValues({});
        setJsonText("{}");
        setResult(null);
        setCompareResult(null);
      }
    }
  }, [tools, toolName]);

  /* sync json text ↔ form mode */
  useEffect(() => {
    if (mode === "json" && loadedTool) {
      const args = buildArgs(loadedTool, fieldValues, "{}", "form");
      setJsonText(JSON.stringify(args ?? {}, null, 2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const risk = loadedTool ? getRisk(loadedTool.name) : "low";
  const riskCfg = RISK[risk];
  const isDestructive = risk === "critical" || risk === "high";

  function parseExtraHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (!extraHeadersText.trim()) return headers;
    for (const line of extraHeadersText.split("\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) {
        headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }
    }
    return headers;
  }

  const doRun = useCallback(async (isCompare = false) => {
    if (!loadedTool || !serverSlug) return;

    if (mode === "json") {
      try { JSON.parse(jsonText); setJsonError(null); }
      catch (e) { setJsonError((e as Error).message); return; }
    }

    const args = buildArgs(loadedTool, fieldValues, jsonText, mode);
    if (args === null) { toast.error("Invalid JSON in editor"); return; }

    setIsRunning(true);
    try {
      const extraHeaders = parseExtraHeaders();
      const r = await execTool(serverSlug, loadedTool.name, args, timeoutMs, extraHeaders, simulatedSubject || undefined);
      if (isCompare) {
        setCompareResult(r);
        setCompareMode(true);
      } else {
        setResult(r);
        setCompareResult(null);
        setCompareMode(false);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
      if (r.ok) toast.success(`Executed in ${r.durationMs}ms`);
      else toast.error("Tool returned an error response");
    } catch (err) {
      const msg = err instanceof Error ? (err.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : err.message) : "Execution failed";
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedTool, serverSlug, mode, fieldValues, jsonText, timeoutMs, simulatedSubject]);

  function handleExecute() {
    if (isDestructive) { setShowConfirm(true); return; }
    doRun();
  }

  function handleConfirm() {
    setShowConfirm(false);
    doRun();
  }

  function handleSaveExample() {
    if (!loadedTool || !serverSlug) return;
    const args = buildArgs(loadedTool, fieldValues, jsonText, mode) ?? {};
    const ex: SavedExample = {
      id: Date.now().toString(),
      label: `${loadedTool.name} — ${new Date().toLocaleTimeString()}`,
      toolName: loadedTool.name,
      serverSlug,
      args,
      savedAt: new Date().toISOString(),
    };
    setSavedExamples((prev) => [ex, ...prev.slice(0, 19)]);
    toast.success("Example saved");
  }

  function handleLoadExample(ex: SavedExample) {
    setServerSlug(ex.serverSlug);
    setToolName(ex.toolName);
    setJsonText(JSON.stringify(ex.args, null, 2));
    setMode("json");
    setShowSaved(false);
    toast.success("Example loaded");
  }

  function handleShareSession() {
    if (!loadedTool) return;
    const args = buildArgs(loadedTool, fieldValues, jsonText, mode) ?? {};
    const params = new URLSearchParams({
      server: serverSlug,
      tool: loadedTool.name,
      args: btoa(JSON.stringify(args)).replace(/=+$/, ""),
    });
    const url = `${window.location.origin}/dashboard/playground?${params}`;
    copyToClipboard(url).then((ok) => { if (ok) toast.success("Session URL copied to clipboard"); });
  }

  /* keyboard shortcut: Cmd/Ctrl+Enter to run */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && loadedTool && !isRunning) {
        e.preventDefault();
        handleExecute();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedTool, isRunning, handleExecute]);

  const currentArgs = loadedTool ? (buildArgs(loadedTool, fieldValues, jsonText, mode) ?? {}) : {};
  const properties = loadedTool?.inputSchema?.properties ?? {};
  const requiredFields = loadedTool?.inputSchema?.required ?? [];

  /* ── panel styles ── */
  const panelStyle: React.CSSProperties = {
    background: "var(--pc-surface)",
    border: "1px solid var(--pc-border)",
    borderRadius: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const sectionHeader = (title: string, icon: React.ReactNode): React.ReactNode => (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "var(--pc-muted)" }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--pc-muted)" }}>{title}</span>
    </div>
  );

  const envColors = {
    production:  { bg: "rgba(240,93,94,0.12)", color: "#F05D5E" },
    staging:     { bg: "rgba(244,185,66,0.12)", color: "#F4B942" },
    development: { bg: "rgba(72,184,232,0.12)", color: "#48B8E8" },
    local:       { bg: "rgba(53,200,138,0.12)", color: "#35C88A" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--pc-foreground)", margin: 0 }}>
              Playground
            </h1>
            <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: "4px 0 0" }}>
              Test MCP tools interactively with schema-generated forms and live execution
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Environment badge */}
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as typeof environment)}
              style={{
                ...inputCss,
                width: "auto",
                padding: "5px 28px 5px 10px",
                fontWeight: 600,
                fontSize: 12,
                borderRadius: 20,
                background: envColors[environment].bg,
                borderColor: envColors[environment].color + "44",
                color: envColors[environment].color,
                cursor: "pointer",
              }}
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
              <option value="local">Local</option>
            </select>

            {/* Policy sim mode */}
            <button
              onClick={() => setPolicySimMode((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${policySimMode ? "rgba(45,212,167,0.4)" : "var(--pc-border)"}`,
                background: policySimMode ? "rgba(45,212,167,0.1)" : "var(--pc-elevated)",
                color: policySimMode ? "var(--pc-primary)" : "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              <Shield size={11} strokeWidth={2} />
              {policySimMode ? "Simulating Policy" : "Policy Sim"}
            </button>

            {/* Redact toggle */}
            <button
              onClick={() => setRedact((v) => !v)}
              title={redact ? "Sensitive values hidden" : "Showing all values"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${redact ? "rgba(244,185,66,0.4)" : "var(--pc-border)"}`,
                background: redact ? "rgba(244,185,66,0.08)" : "var(--pc-elevated)",
                color: redact ? "#F4B942" : "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              {redact ? <EyeOff size={11} strokeWidth={2} /> : <Eye size={11} strokeWidth={2} />}
              {redact ? "Redacting" : "Show All"}
            </button>
          </div>
        </div>

        {/* Policy sim notice */}
        {policySimMode && (
          <div style={{ marginTop: 10, background: "rgba(45,212,167,0.06)", border: "1px solid rgba(45,212,167,0.2)", borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={13} style={{ color: "var(--pc-primary)", flexShrink: 0 }} strokeWidth={2} />
            <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>
              Policy simulation mode — execution is logged but policy decisions are evaluated without side effects. The tool will still be called upstream.
            </p>
          </div>
        )}
      </div>

      {/* Three-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", gap: 12, alignItems: "start" }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 24 }}>

          {/* Server selector */}
          <div style={panelStyle}>
            {sectionHeader("Server", <ServerIcon size={12} strokeWidth={1.75} />)}
            <div style={{ padding: 12 }}>
              <select
                value={serverSlug}
                onChange={(e) => { setServerSlug(e.target.value); setToolName(""); setLoadedTool(null); setResult(null); }}
                style={{ ...inputCss, cursor: "pointer" }}
              >
                <option value="">{serversLoading ? "Loading…" : "Select server…"}</option>
                {servers.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.slug}</option>
                ))}
              </select>
              {serverSlug && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: servers.find((s) => s.slug === serverSlug)?.status === "active" ? "#35C88A" : "#F05D5E",
                  }} />
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-muted)" }}>
                    {servers.find((s) => s.slug === serverSlug)?.status ?? "unknown"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tool selector */}
          <div style={panelStyle}>
            {sectionHeader("Tool", <Zap size={12} strokeWidth={1.75} />)}
            <div style={{ padding: 12 }}>
              {toolsLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pc-muted)", fontSize: 12, padding: "6px 0" }}>
                  <Loader2 size={12} className="animate-spin" strokeWidth={2} /> Loading tools…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                  {!serverSlug ? (
                    <p style={{ fontSize: 12, color: "var(--pc-muted)", padding: "4px 0" }}>Select a server first</p>
                  ) : (tools ?? []).length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--pc-muted)", padding: "4px 0" }}>No tools found</p>
                  ) : (tools ?? []).map((t) => {
                    const r = getRisk(t.name);
                    const rc = RISK[r];
                    const active = toolName === t.name;
                    return (
                      <button
                        key={t.name}
                        onClick={() => setToolName(t.name)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 10px", borderRadius: 8,
                          border: `1px solid ${active ? "rgba(45,212,167,0.3)" : "transparent"}`,
                          background: active ? "rgba(45,212,167,0.08)" : "transparent",
                          cursor: "pointer", textAlign: "left", width: "100%",
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: rc.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: active ? "var(--pc-primary)" : "var(--pc-foreground)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Auth identity */}
          <div style={panelStyle}>
            {sectionHeader("Identity", <User size={12} strokeWidth={1.75} />)}
            <div style={{ padding: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>
                Simulate Subject
              </label>
              <input
                value={simulatedSubject}
                onChange={(e) => setSimulatedSubject(e.target.value)}
                placeholder="subject-uuid or leave blank"
                style={{ ...inputCss, fontSize: 11, fontFamily: "monospace" }}
              />
              <p style={{ fontSize: 10, color: "var(--pc-muted)", marginTop: 5, lineHeight: 1.5 }}>
                Sends <code style={{ fontFamily: "monospace" }}>X-Simulate-Subject</code> header to test policy decisions as a different identity.
              </p>
            </div>
          </div>

          {/* Saved examples */}
          <div style={panelStyle}>
            {sectionHeader("Saved Examples", <Save size={12} strokeWidth={1.75} />)}
            <div style={{ padding: 12 }}>
              {savedExamples.length === 0 ? (
                <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>No saved examples yet. Run a tool and click Save Example.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {savedExamples.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => handleLoadExample(ex)}
                      style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--pc-border)", background: "var(--pc-elevated)", cursor: "pointer", textAlign: "left" }}
                    >
                      <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ex.toolName}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--pc-muted)", margin: "2px 0 0" }}>{ex.serverSlug}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER PANEL ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Destructive warning banner */}
          {loadedTool && isDestructive && (
            <div style={{
              background: riskCfg.bg,
              border: `1px solid ${riskCfg.border}`,
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <ShieldAlert size={15} style={{ color: riskCfg.color, flexShrink: 0, marginTop: 1 }} strokeWidth={2} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: riskCfg.color, margin: "0 0 2px" }}>
                  {risk === "critical" ? "Destructive Tool" : "Elevated Risk Tool"} — {riskCfg.label} Risk
                </p>
                <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0 }}>
                  {risk === "critical"
                    ? "This tool may permanently delete or destroy data. A confirmation dialog will appear before execution."
                    : "This tool modifies state. Confirm your intent before executing."}
                  {" "}This execution will be recorded in the audit log.
                </p>
              </div>
              <span style={{ marginLeft: "auto", background: riskCfg.bg, border: `1px solid ${riskCfg.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 600, color: riskCfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>
                {environment.toUpperCase()}
              </span>
            </div>
          )}

          {/* Tool info + input mode toggle */}
          {loadedTool ? (
            <div style={panelStyle}>
              {/* Tool header */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <code style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-primary)" }}>{loadedTool.name}</code>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
                        background: riskCfg.bg, color: riskCfg.color,
                      }}>
                        {riskCfg.label}
                      </span>
                    </div>
                    {loadedTool.description && (
                      <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>{loadedTool.description}</p>
                    )}
                  </div>
                  {/* Mode toggle */}
                  <div style={{ display: "flex", background: "var(--pc-bg)", borderRadius: 8, padding: 2, flexShrink: 0, border: "1px solid var(--pc-border)" }}>
                    {([["form", <Braces size={11} />, "Form"], ["json", <Code2 size={11} />, "JSON"]] as const).map(([m, icon, label]) => (
                      <button
                        key={m}
                        onClick={() => setMode(m as InputMode)}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 500,
                          background: mode === m ? "var(--pc-surface)" : "transparent",
                          color: mode === m ? "var(--pc-foreground)" : "var(--pc-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {icon}{label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Input area */}
              <div style={{ padding: 16 }}>
                {mode === "form" ? (
                  Object.keys(properties).length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>This tool takes no input parameters.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {Object.entries(properties).map(([key, schema]) => (
                        <PropertyInput
                          key={key}
                          propKey={key}
                          schema={schema}
                          required={requiredFields.includes(key)}
                          value={fieldValues[key] ?? ""}
                          onChange={(v) => setFieldValues((prev) => ({ ...prev, [key]: v }))}
                          redact={redact}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div>
                    <textarea
                      value={jsonText}
                      onChange={(e) => {
                        setJsonText(e.target.value);
                        try { JSON.parse(e.target.value); setJsonError(null); }
                        catch (err) { setJsonError((err as Error).message); }
                      }}
                      rows={Math.max(6, (jsonText.split("\n").length))}
                      placeholder="{}"
                      style={{
                        ...inputCss, fontFamily: "monospace", fontSize: 12,
                        resize: "vertical",
                        borderColor: jsonError ? "#F05D5E" : "var(--pc-border)",
                      }}
                      onFocus={(e) => !jsonError && (e.target.style.borderColor = "var(--pc-primary)")}
                      onBlur={(e) => (e.target.style.borderColor = jsonError ? "#F05D5E" : "var(--pc-border)")}
                    />
                    {jsonError && (
                      <p style={{ fontSize: 11, color: "#F05D5E", marginTop: 4 }}>
                        JSON parse error: {jsonError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Advanced section */}
              <div style={{ borderTop: "1px solid var(--pc-border)" }}>
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", fontSize: 12, width: "100%" }}
                >
                  {showAdvanced ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
                  Advanced Options
                </button>
                {showAdvanced && (
                  <div style={{ padding: "0 16px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Timeout (ms)</label>
                      <input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} style={inputCss} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Idempotency Key</label>
                      <input value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} placeholder="optional-key" style={{ ...inputCss, fontFamily: "monospace" }} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Extra Headers (one per line: Key: Value)</label>
                      <textarea value={extraHeadersText} onChange={(e) => setExtraHeadersText(e.target.value)} rows={2} placeholder={"X-Custom-Header: value"} style={{ ...inputCss, fontFamily: "monospace", fontSize: 11, resize: "vertical" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Execute area */}
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--pc-border)", background: "var(--pc-elevated)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={handleExecute}
                  disabled={isRunning}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    background: isRunning ? "var(--pc-elevated)" : isDestructive ? riskCfg.color : "var(--pc-primary)",
                    color: isDestructive && !isRunning ? "#0C1116" : isRunning ? "var(--pc-muted)" : "#0C1116",
                    borderRadius: 9, padding: "9px 20px", fontSize: 13, fontWeight: 700,
                    border: "none", cursor: isRunning ? "not-allowed" : "pointer", opacity: isRunning ? 0.7 : 1,
                  }}
                >
                  {isRunning ? <Loader2 size={14} className="animate-spin" strokeWidth={2} /> : <Play size={14} strokeWidth={2.5} />}
                  {isRunning ? "Running…" : "Execute"}
                </button>

                {result && (
                  <button
                    onClick={() => doRun(true)}
                    disabled={isRunning}
                    title="Run again and compare with previous result"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}
                  >
                    <GitCompare size={13} strokeWidth={2} /> Compare
                  </button>
                )}

                {result && (
                  <button
                    onClick={() => doRun()}
                    disabled={isRunning}
                    title="Replay last request"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}
                  >
                    <RotateCcw size={13} strokeWidth={2} /> Replay
                  </button>
                )}

                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={handleSaveExample} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 11, cursor: "pointer" }}>
                    <Save size={11} strokeWidth={2} /> Save
                  </button>
                  <button onClick={() => setShowCode(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 11, cursor: "pointer" }}>
                    <Terminal size={11} strokeWidth={2} /> Code
                  </button>
                  <button onClick={handleShareSession} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--pc-border)", background: "none", color: "var(--pc-muted)", fontSize: 11, cursor: "pointer" }}>
                    <LinkIcon size={11} strokeWidth={2} /> Share
                  </button>
                </div>

                <kbd style={{ fontSize: 10, color: "var(--pc-muted)", background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 5, padding: "2px 6px", fontFamily: "monospace" }}>
                  ⌘↵
                </kbd>
              </div>
            </div>
          ) : (
            /* Empty center state */
            <div style={{ ...panelStyle, padding: 56, textAlign: "center", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--pc-elevated)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Zap size={20} style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--pc-foreground)", margin: "0 0 4px" }}>No tool selected</p>
              <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>Choose a server and tool from the left panel to get started.</p>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div ref={resultRef} style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 24 }}>

          {isRunning && !result && (
            <div style={{ ...panelStyle, padding: 32, alignItems: "center", justifyContent: "center", display: "flex", gap: 10, color: "var(--pc-muted)" }}>
              <Loader2 size={18} className="animate-spin" strokeWidth={1.75} />
              <span style={{ fontSize: 13 }}>Executing…</span>
            </div>
          )}

          {result && (
            <>
              {/* Status / meta */}
              <div style={panelStyle}>
                {sectionHeader("Response", <Activity size={12} strokeWidth={1.75} />)}
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Status + duration */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
                      background: result.ok ? "rgba(53,200,138,0.12)" : "rgba(240,93,94,0.12)",
                      color: result.ok ? "#35C88A" : "#F05D5E",
                    }}>
                      {result.ok ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <XCircle size={12} strokeWidth={2.5} />}
                      {result.ok ? "Success" : "Error"}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--pc-muted)" }}>
                      <Clock size={11} strokeWidth={1.5} />{result.durationMs}ms
                    </span>
                  </div>

                  {/* Meta rows */}
                  {[
                    { label: "Outcome", value: result.outcome ?? "—" },
                    { label: "Server", value: result.serverSlug },
                    { label: "Tool", value: result.toolName },
                    { label: "Trace ID", value: result.traceId ?? "—" },
                    { label: "Timestamp", value: new Date(result.timestamp).toLocaleTimeString() },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>{label}</span>
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", textAlign: "right", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Result body */}
              <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--pc-muted)" }}>
                    {compareMode ? "Latest Result" : "Result"}
                  </span>
                  <button
                    onClick={() => { copyToClipboard(JSON.stringify(result.raw, null, 2)).then((ok) => { if (ok) toast.success("Copied"); }); }}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", fontSize: 11 }}
                  >
                    <Copy size={11} strokeWidth={2} /> Copy
                  </button>
                </div>
                <pre style={{ margin: 0, padding: 12, fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.65, maxHeight: 320, overflowY: "auto" }}>
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              </div>

              {/* Compare result */}
              {compareMode && compareResult && (
                <div style={panelStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#48B8E8" }}>
                      <SplitSquareHorizontal size={12} strokeWidth={2} /> Comparison Run
                    </span>
                    <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>{compareResult.durationMs}ms</span>
                  </div>
                  <pre style={{ margin: 0, padding: 12, fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.65, maxHeight: 320, overflowY: "auto" }}>
                    {JSON.stringify(compareResult.raw, null, 2)}
                  </pre>
                  <div style={{ padding: "8px 12px", borderTop: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
                    <p style={{ fontSize: 10, color: "var(--pc-muted)", margin: 0 }}>
                      {JSON.stringify(result.raw) === JSON.stringify(compareResult.raw)
                        ? "Responses are identical"
                        : "Responses differ — check for non-determinism or state changes"}
                    </p>
                  </div>
                </div>
              )}

              {/* Upstream details */}
              <div style={panelStyle}>
                {sectionHeader("Upstream", <ServerIcon size={12} strokeWidth={1.75} />)}
                <div style={{ padding: 12 }}>
                  {(() => {
                    const srv = servers.find((s) => s.slug === result.serverSlug);
                    return srv ? (
                      <>
                        <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: "0 0 4px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{srv.upstream_url}</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          <span style={{ fontSize: 10, background: "var(--pc-elevated)", color: "var(--pc-muted)", borderRadius: 5, padding: "2px 8px", fontFamily: "monospace" }}>{srv.transport}</span>
                          <span style={{ fontSize: 10, background: "var(--pc-elevated)", color: "var(--pc-muted)", borderRadius: 5, padding: "2px 8px", fontFamily: "monospace" }}>{srv.auth_mode}</span>
                        </div>
                      </>
                    ) : (
                      <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>Server info unavailable</p>
                    );
                  })()}
                </div>
              </div>

              {/* Audit notice */}
              <div style={{ padding: "9px 12px", background: "rgba(45,212,167,0.06)", border: "1px solid rgba(45,212,167,0.15)", borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 7 }}>
                <Info size={12} style={{ color: "var(--pc-primary)", flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
                <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0, lineHeight: 1.55 }}>
                  This request was recorded in the audit log
                  {simulatedSubject ? ` as simulated identity "${simulatedSubject}"` : ""}.
                </p>
              </div>
            </>
          )}

          {!result && !isRunning && (
            <div style={{ ...panelStyle, padding: 32, textAlign: "center", alignItems: "center", justifyContent: "center", display: "flex", flexDirection: "column", gap: 8 }}>
              <Hash size={24} style={{ color: "var(--pc-muted)", opacity: 0.3 }} strokeWidth={1.5} />
              <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>Response will appear here after execution.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showConfirm && loadedTool && (
        <ConfirmModal tool={loadedTool} onConfirm={handleConfirm} onCancel={() => setShowConfirm(false)} />
      )}
      {showCode && loadedTool && (
        <CodeModal slug={serverSlug} tool={loadedTool} args={redactArgs(currentArgs, redact)} onClose={() => setShowCode(false)} />
      )}
    </div>
  );
}

/* ── page (suspense for useSearchParams) ─────────────────────────── */

export default function PlaygroundPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 96, color: "var(--pc-muted)" }}>
        <Loader2 size={22} className="animate-spin" strokeWidth={1.5} />
      </div>
    }>
      <PlaygroundInner />
    </Suspense>
  );
}
