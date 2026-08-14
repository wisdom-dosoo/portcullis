"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetServerV1ServersSlugGet,
  useDeleteServerV1ServersSlugDelete,
  useUpdateServerV1ServersSlugPatch,
  useListAuditLogsV1AuditGet,
  type ServerView,
  type AuditLogView,
  type ServerUpdate,
} from "@/api/generated";
import { getToken } from "@/lib/auth";
import {
  Server,
  Globe,
  CheckCircle2,
  XCircle,
  Trash2,
  ArrowLeft,
  Wrench,
  ClipboardList,
  RefreshCw,
  Activity,
  AlertTriangle,
  Play,
  BarChart2,
  Settings,
  Loader2,
  ChevronDown,
  Send,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/* ── types ───────────────────────────────────────────────────────── */

type Tab = "overview" | "tools" | "playground" | "traffic" | "logs" | "configuration";

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
    required?: string[];
  };
};

/* ── helpers ─────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  const disabled = status === "disabled";
  const color = active ? "#2DD4A7" : disabled ? "#8B98A7" : "#F05D5E";
  const bg = active
    ? "rgba(45,212,167,0.12)"
    : disabled
    ? "rgba(139,152,167,0.1)"
    : "rgba(240,93,94,0.12)";
  const Icon = active ? CheckCircle2 : XCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: bg, color }}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {status}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
      style={
        active
          ? { background: "rgba(45,212,167,0.12)", color: "var(--pc-primary)" }
          : { color: "var(--pc-muted)" }
      }
    >
      {children}
    </button>
  );
}

const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-1 focus:ring-[rgba(45,212,167,0.3)]";
const inputStyle: React.CSSProperties = {
  background: "var(--pc-elevated)",
  borderColor: "var(--pc-border)",
  color: "var(--pc-foreground)",
};

/* ── tools tab ───────────────────────────────────────────────────── */

function ToolsTab({ slug }: { slug: string }) {
  const token = getToken();
  const { data: tools, isLoading, error, refetch, isFetching } = useQuery<McpTool[]>({
    queryKey: ["mcp-tools", slug],
    queryFn: async () => {
      const res = await fetch(`/mcp/${slug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "MCP error");
      return json.result?.tools ?? [];
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" style={{ background: "var(--pc-elevated)" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(240,93,94,0.12)" }}
        >
          <AlertTriangle className="w-5 h-5" style={{ color: "#F05D5E" }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
          Failed to fetch tools
        </p>
        <p className="text-xs mt-1 mb-4" style={{ color: "var(--pc-muted)" }}>
          {(error as Error).message}
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: "var(--pc-elevated)", color: "var(--pc-primary)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tools || tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--pc-elevated)" }}
        >
          <Wrench className="w-5 h-5" style={{ color: "var(--pc-muted)", opacity: 0.5 }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>No tools found</p>
        <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
          This server returned an empty tools list
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--pc-border)" }}>
        <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
          {tools.length} tool{tools.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{ color: "var(--pc-muted)" }}
          className="p-1 rounded transition-colors hover:bg-white/5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} strokeWidth={2} />
        </button>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--pc-border)" }}>
        {tools.map((tool) => {
          const paramCount = Object.keys(tool.inputSchema?.properties ?? {}).length;
          return (
            <div
              key={tool.name}
              className="px-5 py-4 flex items-start justify-between gap-4 group transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 mb-1">
                  <code className="text-sm font-mono font-semibold" style={{ color: "var(--pc-primary)" }}>
                    {tool.name}
                  </code>
                  {paramCount > 0 && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(72,184,232,0.12)", color: "#48B8E8" }}
                    >
                      {paramCount} param{paramCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {tool.description && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                    {tool.description}
                  </p>
                )}
              </div>
              <Link
                href={`/dashboard/playground?server=${slug}&tool=${encodeURIComponent(tool.name)}`}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                style={{ background: "rgba(45,212,167,0.12)", color: "var(--pc-primary)" }}
              >
                Try
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── logs tab ────────────────────────────────────────────────────── */

function LogsTab({ slug }: { slug: string }) {
  const { data: resp, isLoading } = useListAuditLogsV1AuditGet({ server_slug: slug, limit: 50 });
  const logs = (resp?.data ?? []) as AuditLogView[];

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--pc-elevated)" }}>
          <ClipboardList className="w-5 h-5" style={{ color: "var(--pc-muted)", opacity: 0.5 }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>No events yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
          Events appear as traffic flows through this server
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
          {["Outcome", "Event", "Tool", "Subject", "Time"].map((h, i) => (
            <th
              key={h}
              className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${i === 4 ? "text-right" : "text-left"}`}
              style={{ color: "var(--pc-muted)" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => {
          const isAllowed = log.outcome === "allowed";
          const isDenied  = log.outcome === "denied";
          const color     = isAllowed ? "#35C88A" : isDenied ? "#F05D5E" : "#F4B942";
          const bg        = isAllowed ? "rgba(53,200,138,0.12)" : isDenied ? "rgba(240,93,94,0.12)" : "rgba(244,185,66,0.12)";
          const Ic        = isAllowed ? CheckCircle2 : isDenied ? XCircle : AlertTriangle;
          return (
            <tr key={log.id} style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}>
              <td className="px-5 py-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full" style={{ background: bg, color }}>
                  <Ic className="w-3 h-3" strokeWidth={2.5} />
                  {log.outcome}
                </span>
              </td>
              <td className="px-5 py-3">
                <code className="text-xs font-mono" style={{ color: "var(--pc-foreground)" }}>{log.event_type}</code>
              </td>
              <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--pc-secondary)" }}>
                {log.tool_name ?? <span style={{ color: "var(--pc-border)" }}>—</span>}
              </td>
              <td className="px-5 py-3 text-xs max-w-[120px] truncate" style={{ color: "var(--pc-muted)" }}>
                {log.subject_id ?? <span style={{ color: "var(--pc-border)" }}>—</span>}
              </td>
              <td className="px-5 py-3 text-xs text-right tabular-nums" style={{ color: "var(--pc-muted)" }}>
                {new Date(log.created_at).toLocaleString()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── overview tab ────────────────────────────────────────────────── */

function OverviewTab({ server }: { server: ServerView }) {
  const rows = [
    { label: "Slug",               value: server.slug,                                    mono: true  },
    { label: "Upstream URL",       value: server.upstream_url,                            mono: true  },
    { label: "Transport",          value: server.transport,                               mono: true  },
    { label: "Auth Mode",          value: server.auth_mode ?? "—",                        mono: false },
    { label: "Created",            value: new Date(server.created_at).toLocaleString(),   mono: false },
    {
      label: "Last Health Check",
      value: server.last_health_check_at
        ? new Date(server.last_health_check_at).toLocaleString()
        : "Never",
      mono: false,
    },
    {
      label: "Health Failures",
      value: String(server.consecutive_health_failures ?? 0),
      mono: false,
    },
  ];

  return (
    <div className="p-5 space-y-4">
      <div
        className="rounded-xl overflow-hidden divide-y"
        style={{
          background: "var(--pc-elevated)",
          border: "1px solid var(--pc-border)",
        }}
      >
        {rows.map(({ label, value, mono }) => (
          <div key={label} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid var(--pc-border)" }}>
            <span className="w-40 flex-shrink-0 text-xs font-medium" style={{ color: "var(--pc-muted)" }}>
              {label}
            </span>
            {mono
              ? <code className="text-xs font-mono truncate" style={{ color: "var(--pc-secondary)" }}>{value}</code>
              : <span className="text-sm" style={{ color: "var(--pc-foreground)" }}>{value}</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── playground tab ──────────────────────────────────────────────── */

function PlaygroundTab({ slug }: { slug: string }) {
  const token = getToken();

  const { data: tools, isLoading: toolsLoading, error: toolsError } = useQuery<McpTool[]>({
    queryKey: ["mcp-tools", slug],
    queryFn: async () => {
      const res = await fetch(`/mcp/${slug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "MCP error");
      return json.result?.tools ?? [];
    },
    retry: false,
  });

  const [selectedTool, setSelectedTool] = useState<string>("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [callState, setCallState] = useState<"idle" | "calling" | "done" | "error">("idle");
  const [response, setResponse] = useState<unknown>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const tool = tools?.find((t) => t.name === selectedTool) ?? null;
  const properties = tool?.inputSchema?.properties ?? {};
  const required = tool?.inputSchema?.required ?? [];

  function handleToolChange(name: string) {
    setSelectedTool(name);
    setFieldValues({});
    setCallState("idle");
    setResponse(null);
    setCallError(null);
  }

  function setField(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCall() {
    if (!tool) return;
    setCallState("calling");
    setResponse(null);
    setCallError(null);

    // Build arguments — parse JSON for object/array fields
    const args: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(properties)) {
      const raw = fieldValues[key] ?? "";
      if (raw === "" && !required.includes(key)) continue;
      const schemaType = (schema as { type?: string }).type;
      if (schemaType === "object" || schemaType === "array") {
        try {
          args[key] = JSON.parse(raw);
        } catch {
          toast.error(`Field "${key}" must be valid JSON`);
          setCallState("error");
          return;
        }
      } else if (schemaType === "number" || schemaType === "integer") {
        args[key] = Number(raw);
      } else if (schemaType === "boolean") {
        args[key] = raw === "true" || raw === "1";
      } else {
        args[key] = raw;
      }
    }

    try {
      const res = await fetch(`/mcp/${slug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: tool.name, arguments: args },
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "MCP error");
      setResponse(json.result);
      setCallState("done");
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Unknown error");
      setCallState("error");
    }
  }

  if (toolsLoading) {
    return (
      <div className="p-5 space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
        ))}
      </div>
    );
  }

  if (toolsError) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(240,93,94,0.12)" }}
        >
          <AlertTriangle className="w-5 h-5" style={{ color: "#F05D5E" }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
          Failed to load tools
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
          {(toolsError as Error).message}
        </p>
      </div>
    );
  }

  if (!tools || tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--pc-elevated)" }}>
          <Play className="w-5 h-5" style={{ color: "var(--pc-muted)", opacity: 0.5 }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>No tools available</p>
        <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
          This server has no discoverable tools to test
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* Tool selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
          Select Tool
        </label>
        <div className="relative">
          <select
            className={inputBase}
            style={{ ...inputStyle, appearance: "none", paddingRight: "2.5rem" }}
            value={selectedTool}
            onChange={(e) => handleToolChange(e.target.value)}
          >
            <option value="">Choose a tool…</option>
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--pc-muted)" }}
            strokeWidth={1.75}
          />
        </div>
      </div>

      {tool && (
        <>
          {/* Tool description */}
          {tool.description && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)", border: "1px solid var(--pc-border)" }}
            >
              {tool.description}
            </div>
          )}

          {/* Schema-driven form */}
          {Object.keys(properties).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(properties).map(([key, schema]) => {
                const isRequired = required.includes(key);
                const schemaTyped = schema as { type?: string; description?: string; enum?: unknown[] };
                const isBoolean = schemaTyped.type === "boolean";
                const isTextarea =
                  schemaTyped.type === "object" || schemaTyped.type === "array";

                return (
                  <div key={key} className="space-y-1.5">
                    <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
                      <code className="font-mono" style={{ color: "var(--pc-secondary)" }}>{key}</code>
                      {isRequired && <span style={{ color: "var(--pc-critical)" }}> *</span>}
                      {schemaTyped.type && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(139,152,167,0.1)", color: "var(--pc-muted)" }}>
                          {schemaTyped.type}
                        </span>
                      )}
                    </label>
                    {isBoolean ? (
                      <select
                        className={inputBase}
                        style={inputStyle}
                        value={fieldValues[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                      >
                        <option value="">—</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : schemaTyped.enum ? (
                      <select
                        className={inputBase}
                        style={inputStyle}
                        value={fieldValues[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                      >
                        <option value="">—</option>
                        {schemaTyped.enum.map((v) => (
                          <option key={String(v)} value={String(v)}>
                            {String(v)}
                          </option>
                        ))}
                      </select>
                    ) : isTextarea ? (
                      <textarea
                        className={`${inputBase} resize-none font-mono text-xs`}
                        style={{ ...inputStyle, minHeight: "80px" }}
                        value={fieldValues[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                        placeholder={`Enter JSON ${schemaTyped.type}…`}
                      />
                    ) : (
                      <input
                        type={schemaTyped.type === "number" || schemaTyped.type === "integer" ? "number" : "text"}
                        className={inputBase}
                        style={inputStyle}
                        value={fieldValues[key] ?? ""}
                        onChange={(e) => setField(key, e.target.value)}
                        placeholder={schemaTyped.description ?? ""}
                      />
                    )}
                    {schemaTyped.description && !isTextarea && (
                      <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
                        {schemaTyped.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
              This tool takes no parameters.
            </p>
          )}

          {/* Call button */}
          <button
            onClick={handleCall}
            disabled={callState === "calling"}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            {callState === "calling" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" strokeWidth={2} />
            )}
            {callState === "calling" ? "Calling…" : "Call Tool"}
          </button>

          {/* Response */}
          {callState === "done" && response !== null && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium" style={{ color: "var(--pc-muted)" }}>Response</p>
              <pre
                className="rounded-xl px-4 py-4 text-xs font-mono overflow-x-auto"
                style={{
                  background: "#0a0e12",
                  color: "var(--pc-primary)",
                  border: "1px solid var(--pc-border)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}

          {callState === "error" && callError && (
            <div
              className="rounded-xl px-4 py-3 text-xs"
              style={{ background: "rgba(240,93,94,0.08)", color: "#F05D5E", border: "1px solid rgba(240,93,94,0.2)" }}
            >
              {callError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── traffic tab ─────────────────────────────────────────────────── */

type HourBucket = { hour: string; allowed: number; denied: number };

function TrafficTab({ slug }: { slug: string }) {
  const { data: resp, isLoading } = useListAuditLogsV1AuditGet({ server_slug: slug, limit: 200 });
  const logs = (resp?.data ?? []) as AuditLogView[];

  if (isLoading) {
    return (
      <div className="p-5 space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" style={{ background: "var(--pc-elevated)" }} />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" style={{ background: "var(--pc-elevated)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--pc-elevated)" }}>
          <BarChart2 className="w-5 h-5" style={{ color: "var(--pc-muted)", opacity: 0.5 }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>No traffic data yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
          Charts will appear once requests flow through this server
        </p>
      </div>
    );
  }

  // Bucket by hour
  const bucketMap: Record<string, HourBucket> = {};
  for (const log of logs) {
    const d = new Date(log.created_at);
    const hour = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
    if (!bucketMap[hour]) bucketMap[hour] = { hour, allowed: 0, denied: 0 };
    if (log.outcome === "allowed") bucketMap[hour].allowed++;
    else if (log.outcome === "denied") bucketMap[hour].denied++;
  }
  const chartData = Object.values(bucketMap).sort((a, b) =>
    a.hour.localeCompare(b.hour)
  );

  // Stats
  const total = logs.length;
  const allowed = logs.filter((l) => l.outcome === "allowed").length;
  const denied = logs.filter((l) => l.outcome === "denied").length;
  const pctAllowed = total > 0 ? Math.round((allowed / total) * 100) : 0;
  const pctDenied = total > 0 ? Math.round((denied / total) * 100) : 0;

  // Top tools
  const toolCounts: Record<string, number> = {};
  for (const log of logs) {
    if (log.tool_name) toolCounts[log.tool_name] = (toolCounts[log.tool_name] ?? 0) + 1;
  }
  const topTools = Object.entries(toolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  const maxCount = topTools[0]?.[1] ?? 1;
  const uniqueTools = Object.keys(toolCounts).length;

  const statCards = [
    { label: "Total Requests", value: total, color: "var(--pc-foreground)" },
    { label: "Allowed", value: `${pctAllowed}%`, color: "#35C88A" },
    { label: "Denied", value: `${pctDenied}%`, color: "#F05D5E" },
    { label: "Unique Tools", value: uniqueTools, color: "#48B8E8" },
  ];

  return (
    <div className="p-5 space-y-6">
      {/* Area chart */}
      <div>
        <p className="text-xs font-medium mb-3" style={{ color: "var(--pc-muted)" }}>
          Requests by hour
        </p>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#35C88A" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#35C88A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDenied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F05D5E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F05D5E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(38,48,58,0.8)" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fill: "#8B98A7", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#8B98A7", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--pc-foreground)",
                }}
                cursor={{ stroke: "rgba(139,152,167,0.2)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "#8B98A7" }}
              />
              <Area
                type="monotone"
                dataKey="allowed"
                stroke="#35C88A"
                strokeWidth={2}
                fill="url(#gradAllowed)"
                name="Allowed"
              />
              <Area
                type="monotone"
                dataKey="denied"
                stroke="#F05D5E"
                strokeWidth={2}
                fill="url(#gradDenied)"
                name="Denied"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl px-4 py-3"
            style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>{label}</p>
            <p className="text-xl font-bold mt-1 tabular-nums" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Top tools */}
      {topTools.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-3" style={{ color: "var(--pc-muted)" }}>
            Top Tools
          </p>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}
          >
            {topTools.map(([tool, count], i) => (
              <div
                key={tool}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < topTools.length - 1 ? "1px solid var(--pc-border)" : undefined }}
              >
                <span className="w-4 text-xs tabular-nums text-right flex-shrink-0" style={{ color: "var(--pc-muted)" }}>
                  {i + 1}
                </span>
                <code className="text-xs font-mono flex-1 truncate" style={{ color: "var(--pc-primary)" }}>
                  {tool}
                </code>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className="rounded-full"
                    style={{
                      height: "6px",
                      width: `${Math.max(20, Math.round((count / maxCount) * 80))}px`,
                      background: "rgba(45,212,167,0.3)",
                    }}
                  />
                  <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--pc-muted)" }}>
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── configuration tab ───────────────────────────────────────────── */

function ConfigurationTab({ server, slug }: { server: ServerView; slug: string }) {
  const qc = useQueryClient();
  const updateServer = useUpdateServerV1ServersSlugPatch();

  const [name, setName] = useState(server.name);
  const [upstreamUrl, setUpstreamUrl] = useState(server.upstream_url);
  const [transport, setTransport] = useState<"streamable_http">(server.transport);
  const [authMode, setAuthMode] = useState<"none" | "service_token">(server.auth_mode);
  const [healthCheckPath, setHealthCheckPath] = useState(server.health_check_path);
  const [serviceTokenEnvVar, setServiceTokenEnvVar] = useState("");

  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const isDisabled = server.status === "disabled";

  async function handleSave() {
    setSaving(true);
    const patch: ServerUpdate = {};
    if (name !== server.name) patch.name = name;
    if (upstreamUrl !== server.upstream_url) patch.upstream_url = upstreamUrl;
    if (transport !== server.transport) patch.transport = transport;
    if (authMode !== server.auth_mode) patch.auth_mode = authMode;
    if (healthCheckPath !== server.health_check_path) patch.health_check_path = healthCheckPath;
    if (serviceTokenEnvVar) patch.service_token_env_var = serviceTokenEnvVar;

    if (Object.keys(patch).length === 0) {
      toast.info("No changes to save");
      setSaving(false);
      return;
    }

    try {
      await updateServer.mutateAsync({ slug, data: patch });
      toast.success("Server updated");
      qc.invalidateQueries({ queryKey: [`/v1/servers/${slug}`] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update server");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    setToggling(true);
    const newStatus = isDisabled ? "active" : "disabled";
    try {
      await updateServer.mutateAsync({ slug, data: { status: newStatus } });
      toast.success(`Server ${newStatus === "active" ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: [`/v1/servers/${slug}`] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="p-5 space-y-6">
      {/* Status row */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
            Server Status
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            {isDisabled ? "This server is currently disabled and won't accept traffic" : "This server is active and accepting traffic"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={server.status} />
          <button
            onClick={handleToggleStatus}
            disabled={toggling}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
            style={{
              background: isDisabled ? "rgba(53,200,138,0.1)" : "rgba(240,93,94,0.1)",
              color: isDisabled ? "#35C88A" : "#F05D5E",
              border: `1px solid ${isDisabled ? "rgba(53,200,138,0.2)" : "rgba(240,93,94,0.2)"}`,
            }}
          >
            {toggling && <Loader2 className="w-3 h-3 animate-spin" />}
            {isDisabled ? "Enable Server" : "Disable Server"}
          </button>
        </div>
      </div>

      {/* Edit form */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>
          Server Settings
        </p>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Name</label>
          <input
            className={inputBase}
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Slug</label>
          <input
            className={`${inputBase} font-mono opacity-60`}
            style={{ ...inputStyle }}
            value={server.slug}
            disabled
            title="Slug cannot be changed after creation"
          />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Slug cannot be changed after creation.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Upstream URL</label>
          <input
            className={`${inputBase} font-mono`}
            style={inputStyle}
            value={upstreamUrl}
            onChange={(e) => setUpstreamUrl(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Transport</label>
            <select
              className={inputBase}
              style={inputStyle}
              value={transport}
              onChange={(e) => setTransport(e.target.value as "streamable_http")}
            >
              <option value="streamable_http">Streamable HTTP</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Auth Mode</label>
            <select
              className={inputBase}
              style={inputStyle}
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value as "none" | "service_token")}
            >
              <option value="none">None</option>
              <option value="service_token">Service Token</option>
            </select>
          </div>
        </div>

        {authMode === "service_token" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
              Service Token Env Var
            </label>
            <input
              className={`${inputBase} font-mono`}
              style={inputStyle}
              value={serviceTokenEnvVar}
              onChange={(e) => setServiceTokenEnvVar(e.target.value)}
              placeholder="MY_SERVICE_TOKEN"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Health Check Path</label>
          <input
            className={`${inputBase} font-mono`}
            style={inputStyle}
            value={healthCheckPath}
            onChange={(e) => setHealthCheckPath(e.target.value)}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function ServerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router    = useRouter();
  const qc        = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: resp, isLoading } = useGetServerV1ServersSlugGet(slug);
  const server = resp?.data as ServerView | undefined;
  const deleteServer = useDeleteServerV1ServersSlugDelete();

  async function handleDelete() {
    if (!confirm(`Delete server "${slug}"? This cannot be undone.`)) return;
    try {
      await deleteServer.mutateAsync({ slug });
      toast.success("Server deleted");
      qc.invalidateQueries({ queryKey: ["/v1/servers"] });
      router.push("/dashboard/servers");
    } catch {
      toast.error("Failed to delete server");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-lg" style={{ background: "var(--pc-surface)" }} />
        <Skeleton className="h-40 w-full rounded-2xl" style={{ background: "var(--pc-surface)" }} />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>Server not found</p>
        <Link href="/dashboard/servers" className="text-xs mt-2" style={{ color: "var(--pc-primary)" }}>
          ← Back to servers
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",      label: "Overview",      icon: <Activity    className="w-3.5 h-3.5" strokeWidth={1.75} /> },
    { id: "tools",         label: "Tools",         icon: <Wrench      className="w-3.5 h-3.5" strokeWidth={1.75} /> },
    { id: "playground",    label: "Playground",    icon: <Play        className="w-3.5 h-3.5" strokeWidth={1.75} /> },
    { id: "traffic",       label: "Traffic",       icon: <BarChart2   className="w-3.5 h-3.5" strokeWidth={1.75} /> },
    { id: "logs",          label: "Logs",          icon: <ClipboardList className="w-3.5 h-3.5" strokeWidth={1.75} /> },
    { id: "configuration", label: "Configuration", icon: <Settings    className="w-3.5 h-3.5" strokeWidth={1.75} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/dashboard/servers"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 transition-colors hover:opacity-80"
          style={{ color: "var(--pc-muted)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All servers
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(72,184,232,0.15)" }}
            >
              <Server className="w-5 h-5" style={{ color: "#48B8E8" }} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono" style={{ color: "var(--pc-foreground)" }}>
                {server.slug}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Globe className="w-3 h-3" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                <span className="text-xs truncate max-w-[300px]" style={{ color: "var(--pc-muted)" }}>
                  {server.upstream_url}
                </span>
                <StatusBadge status={server.status} />
              </div>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(240,93,94,0.3)", color: "#F05D5E" }}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            Delete
          </button>
        </div>
      </div>

      {/* Tabs + content */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {/* Tab bar */}
        <div
          className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
          style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
        >
          {tabs.map(({ id, label, icon }) => (
            <TabButton key={id} active={tab === id} onClick={() => setTab(id)}>
              <span className="flex items-center gap-2">
                {icon}
                {label}
              </span>
            </TabButton>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview"      && <OverviewTab server={server} />}
        {tab === "tools"         && <ToolsTab slug={slug} />}
        {tab === "playground"    && <PlaygroundTab slug={slug} />}
        {tab === "traffic"       && <TrafficTab slug={slug} />}
        {tab === "logs"          && <LogsTab slug={slug} />}
        {tab === "configuration" && <ConfigurationTab server={server} slug={slug} />}
      </div>
    </div>
  );
}
