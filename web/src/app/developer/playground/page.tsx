"use client";

import { useState, useCallback, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Loader2,
  AlertCircle,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useListServersV1ServersGet, type ServerView } from "@/api/generated";
import { getToken } from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
}

interface McpToolInputSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
}

interface McpToolsListResult {
  result?: { tools?: McpTool[] };
  error?: { code: number; message: string };
}

interface McpCallResult {
  result?: unknown;
  error?: { code: number; message: string };
}

interface RunResult {
  json: McpCallResult;
  durationMs: number;
  ok: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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

async function callTool(
  serverSlug: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<RunResult> {
  const token = getToken();
  const start = performance.now();
  const res = await fetch(`${API_BASE}/mcp/${serverSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const durationMs = Math.round(performance.now() - start);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json: McpCallResult = await res.json();
  return { json, durationMs, ok: !json.error };
}

// ─── Shared styles ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--pc-elevated)",
  border: "1px solid var(--pc-border)",
  color: "var(--pc-foreground)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  cursor: "pointer",
};

// ─── Property Input ────────────────────────────────────────────────────────

function PropertyInput({
  propKey,
  schema,
  required,
  value,
  onChange,
}: {
  propKey: string;
  schema: JsonSchemaProperty;
  required: boolean;
  value: string;
  onChange: (val: string) => void;
}) {
  const type = schema.type ?? "string";

  const label = (
    <label
      style={{
        display: "block",
        fontSize: 12,
        fontWeight: 500,
        marginBottom: 4,
        color: "var(--pc-muted)",
        fontFamily: "monospace",
      }}
    >
      {propKey}
      {required && (
        <span style={{ color: "var(--pc-critical)", marginLeft: 4 }}>*</span>
      )}
      {schema.type && (
        <span
          style={{
            marginLeft: 6,
            background: "var(--pc-elevated)",
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 10,
            fontFamily: "monospace",
            color: "var(--pc-muted)",
            border: "1px solid var(--pc-border)",
          }}
        >
          {schema.type}
        </span>
      )}
    </label>
  );

  if (type === "boolean") {
    return (
      <div>
        {label}
        {schema.description && (
          <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 6 }}>
            {schema.description}
          </p>
        )}
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
        >
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            style={{ width: 16, height: 16, accentColor: "var(--pc-primary)", cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: "var(--pc-foreground)" }}>
            {value === "true" ? "true" : "false"}
          </span>
        </label>
      </div>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <div>
        {label}
        {schema.description && (
          <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 6 }}>
            {schema.description}
          </p>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          style={inputStyle}
          onFocus={(e) => (e.target.style.outline = "2px solid var(--pc-primary)")}
          onBlur={(e) => (e.target.style.outline = "none")}
        />
      </div>
    );
  }

  return (
    <div>
      {label}
      {schema.description && (
        <p style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 6 }}>
          {schema.description}
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${propKey}…`}
        rows={2}
        style={{
          ...inputStyle,
          resize: "vertical",
          fontFamily: propKey.toLowerCase().includes("json") ? "monospace" : undefined,
        }}
        onFocus={(e) => (e.target.style.outline = "2px solid var(--pc-primary)")}
        onBlur={(e) => (e.target.style.outline = "none")}
      />
    </div>
  );
}

// ─── Result Panel ──────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: RunResult }) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--pc-border)",
          background: "var(--pc-elevated)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: result.ok ? "var(--pc-success)" : "var(--pc-critical)",
          }}
        >
          {result.ok ? (
            <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
          ) : (
            <XCircle className="w-4 h-4" strokeWidth={2} />
          )}
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {result.ok ? "Success" : "Error"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "var(--pc-muted)",
            fontSize: 12,
            marginLeft: "auto",
          }}
        >
          <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
          {result.durationMs} ms
        </div>
      </div>

      <pre
        style={{
          margin: 0,
          padding: 16,
          fontSize: 12,
          fontFamily: "monospace",
          color: "var(--pc-foreground)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.6,
          maxHeight: 500,
          overflowY: "auto",
        }}
      >
        {JSON.stringify(result.json, null, 2)}
      </pre>
    </div>
  );
}

// ─── Inner Page ────────────────────────────────────────────────────────────

function PlaygroundInner() {
  const searchParams = useSearchParams();

  const [serverSlug, setServerSlug] = useState<string>(
    searchParams.get("server") ?? ""
  );
  const [toolName, setToolName] = useState<string>(
    searchParams.get("tool") ?? ""
  );
  const [loadedTool, setLoadedTool] = useState<McpTool | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { data: serversResp, isLoading: serversLoading } = useListServersV1ServersGet();
  const servers = (Array.isArray(serversResp?.data) ? serversResp.data : []) as ServerView[];

  const { data: tools, isLoading: toolsLoading } = useQuery<McpTool[], Error>({
    queryKey: ["mcp-tools", serverSlug],
    queryFn: () => fetchToolsList(serverSlug),
    enabled: !!serverSlug,
    retry: 1,
  });
  const activeTool = loadedTool ?? tools?.find((tool) => tool.name === toolName) ?? null;

  const handleLoadTool = useCallback(() => {
    if (!serverSlug) { toast.error("Select a server first."); return; }
    if (!toolName) { toast.error("Select a tool first."); return; }
    const found = tools?.find((t) => t.name === toolName);
    if (!found) { toast.error("Tool not found. Try reloading."); return; }
    setLoadedTool(found);
    setFieldValues({});
    setRunResult(null);
  }, [serverSlug, toolName, tools]);

  const handleRun = useCallback(async () => {
    if (!activeTool || !serverSlug) return;
    setIsRunning(true);
    setRunResult(null);
    try {
      const args: Record<string, unknown> = {};
      const props = activeTool.inputSchema?.properties ?? {};
      for (const [key, schema] of Object.entries(props)) {
        const raw = fieldValues[key] ?? "";
        if (raw === "" && !activeTool.inputSchema?.required?.includes(key)) continue;
        const type = (schema as JsonSchemaProperty).type ?? "string";
        if (type === "boolean") args[key] = raw === "true";
        else if (type === "number" || type === "integer") args[key] = raw === "" ? 0 : Number(raw);
        else args[key] = raw;
      }
      const result = await callTool(serverSlug, activeTool.name, args);
      setRunResult(result);
      if (result.ok) toast.success("Tool executed successfully.");
      else toast.error("Tool returned an error.");
    } catch (err) {
      toast.error((err as Error)?.message ?? "Execution failed.");
    } finally {
      setIsRunning(false);
    }
  }, [activeTool, serverSlug, fieldValues]);

  const properties = activeTool?.inputSchema?.properties ?? {};
  const requiredFields = activeTool?.inputSchema?.required ?? [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>
          Playground
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Test MCP tools interactively
        </p>
      </div>

      {/* Controls */}
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          {/* Server selector */}
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--pc-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Server
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={serverSlug}
                onChange={(e) => {
                  setServerSlug(e.target.value);
                  setToolName("");
                  setLoadedTool(null);
                  setRunResult(null);
                }}
                style={selectStyle}
                onFocus={(e) => (e.target.style.outline = "2px solid var(--pc-primary)")}
                onBlur={(e) => (e.target.style.outline = "none")}
              >
                <option value="">{serversLoading ? "Loading…" : "Select server…"}</option>
                {servers.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.slug}</option>
                ))}
              </select>
              <ChevronDown
                className="w-3.5 h-3.5"
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--pc-muted)",
                  pointerEvents: "none",
                }}
                strokeWidth={1.5}
              />
            </div>
          </div>

          {/* Tool selector */}
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--pc-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Tool
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={toolName}
                onChange={(e) => {
                  setToolName(e.target.value);
                  setLoadedTool(null);
                  setRunResult(null);
                }}
                disabled={!serverSlug || toolsLoading}
                style={{
                  ...selectStyle,
                  opacity: !serverSlug || toolsLoading ? 0.5 : 1,
                }}
                onFocus={(e) => (e.target.style.outline = "2px solid var(--pc-primary)")}
                onBlur={(e) => (e.target.style.outline = "none")}
              >
                <option value="">
                  {toolsLoading ? "Loading tools…" : !serverSlug ? "Select server first…" : "Select tool…"}
                </option>
                {(tools ?? []).map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
              <ChevronDown
                className="w-3.5 h-3.5"
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--pc-muted)",
                  pointerEvents: "none",
                }}
                strokeWidth={1.5}
              />
            </div>
          </div>

          {/* Load button */}
          <button
            onClick={handleLoadTool}
            disabled={!serverSlug || !toolName || toolsLoading}
            style={{
              background: "var(--pc-primary)",
              color: "#0C1116",
              borderRadius: 10,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: !serverSlug || !toolName || toolsLoading ? "not-allowed" : "pointer",
              opacity: !serverSlug || !toolName || toolsLoading ? 0.5 : 1,
              flexShrink: 0,
              alignSelf: "flex-end",
            }}
          >
            Load Tool
          </button>
        </div>
      </div>

      {/* Tool form */}
      {activeTool && (
        <div
          style={{
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--pc-border)",
              background: "var(--pc-elevated)",
            }}
          >
            <p
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--pc-foreground)",
                marginBottom: 2,
              }}
            >
              {activeTool.name}
            </p>
            {activeTool.description && (
              <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>{activeTool.description}</p>
            )}
          </div>

          <div style={{ padding: 20 }}>
            {Object.keys(properties).length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
                This tool takes no input parameters.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {Object.entries(properties).map(([key, schema]) => (
                  <PropertyInput
                    key={key}
                    propKey={key}
                    schema={schema as JsonSchemaProperty}
                    required={requiredFields.includes(key)}
                    value={fieldValues[key] ?? ""}
                    onChange={(val) =>
                      setFieldValues((prev) => ({ ...prev, [key]: val }))
                    }
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={handleRun}
                disabled={isRunning}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--pc-primary)",
                  color: "#0C1116",
                  borderRadius: 10,
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  cursor: isRunning ? "not-allowed" : "pointer",
                  opacity: isRunning ? 0.7 : 1,
                }}
              >
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Play className="w-4 h-4" strokeWidth={2.5} />
                )}
                {isRunning ? "Running…" : "Run Tool"}
              </button>

              {requiredFields.length > 0 && (
                <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>
                  <span style={{ color: "var(--pc-critical)" }}>*</span> Required fields
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Running indicator */}
      {isRunning && !runResult && (
        <div
          style={{
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 16,
            padding: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "var(--pc-muted)",
          }}
        >
          <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
          <span style={{ fontSize: 13 }}>Executing tool…</span>
        </div>
      )}

      {/* Result panel */}
      {runResult && <ResultPanel result={runResult} />}

      {/* Empty state */}
      {!activeTool && !isRunning && (
        <div
          style={{
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 16,
            padding: 48,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--pc-elevated)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <AlertCircle
              className="w-5 h-5"
              style={{ color: "var(--pc-muted)" }}
              strokeWidth={1.5}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
            No tool loaded
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
            Select a server and tool above, then click &quot;Load Tool&quot;.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperPlaygroundPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center py-24"
          style={{ color: "var(--pc-muted)" }}
        >
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.5} />
        </div>
      }
    >
      <PlaygroundInner />
    </Suspense>
  );
}
