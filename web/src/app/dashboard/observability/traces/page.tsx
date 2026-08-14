"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Layers,
  ArrowLeft,
  Filter,
  RefreshCw,
  Tag,
  Terminal,
  Info,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  type AuditLogView,
  AuditEventType,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";

/* ── types ───────────────────────────────────────────────────────────────── */

interface Span {
  id: string;
  name: string;
  startOffset: number; // ms from trace start
  duration: number;    // ms
  status: "ok" | "error" | "warn";
  attributes: Record<string, string>;
  logs: string[];
  errors: string[];
}

interface Trace {
  id: string;
  tool: string;
  server: string;
  user: string;
  outcome: string;
  startTime: string;
  totalDuration: number; // ms (synthesized)
  spans: Span[];
  raw: AuditLogView;
}

/* ── span synthesis ──────────────────────────────────────────────────────── */

const SPAN_DEFINITIONS: Array<{
  name: string;
  baseOffset: number;
  baseDuration: number;
  statusFn: (log: AuditLogView) => "ok" | "error" | "warn";
  attrsFn: (log: AuditLogView) => Record<string, string>;
  logsFn: (log: AuditLogView) => string[];
  errorsFn: (log: AuditLogView) => string[];
}> = [
  {
    name: "Client request",
    baseOffset: 0,
    baseDuration: 2,
    statusFn: () => "ok",
    attrsFn: (l) => ({
      "http.method": "POST",
      "http.url": "/rpc",
      "client.ip": l.client_ip ?? "unknown",
      "request.id": l.request_id ?? "—",
    }),
    logsFn: () => ["Request received"],
    errorsFn: () => [],
  },
  {
    name: "Authentication",
    baseOffset: 3,
    baseDuration: 8,
    statusFn: (l) =>
      l.event_type === AuditEventType.auth_failure ? "error" : "ok",
    attrsFn: (l) => ({
      "auth.subject": l.subject_id ?? "—",
      "auth.type": l.subject_type ?? "api_key",
      "auth.outcome": l.event_type === AuditEventType.auth_failure ? "fail" : "pass",
    }),
    logsFn: (l) =>
      l.event_type === AuditEventType.auth_failure
        ? ["Token validation failed"]
        : ["API key verified", "Subject resolved"],
    errorsFn: (l) =>
      l.event_type === AuditEventType.auth_failure
        ? ["Authentication failed: invalid or expired API key"]
        : [],
  },
  {
    name: "Policy evaluation",
    baseOffset: 12,
    baseDuration: 6,
    statusFn: (l) =>
      l.event_type === AuditEventType.rbac_deny ? "error" : "ok",
    attrsFn: (l) => ({
      "policy.server": l.server_slug ?? "—",
      "policy.tool": l.tool_name ?? "—",
      "policy.outcome": l.event_type === AuditEventType.rbac_deny ? "deny" : "allow",
    }),
    logsFn: (l) =>
      l.event_type === AuditEventType.rbac_deny
        ? ["RBAC policy matched: deny"]
        : ["Permissions resolved", "Policy check passed"],
    errorsFn: (l) =>
      l.event_type === AuditEventType.rbac_deny
        ? [`Access denied to tool "${l.tool_name ?? "unknown"}" on server "${l.server_slug ?? "unknown"}"`]
        : [],
  },
  {
    name: "Rate limit check",
    baseOffset: 19,
    baseDuration: 4,
    statusFn: (l) =>
      l.outcome === "rate_limited" ? "error" : "ok",
    attrsFn: (l) => ({
      "ratelimit.subject": l.subject_id ?? "—",
      "ratelimit.server": l.server_slug ?? "—",
      "ratelimit.result": l.outcome === "rate_limited" ? "exceeded" : "allowed",
    }),
    logsFn: (l) =>
      l.outcome === "rate_limited"
        ? ["Rate limit quota exceeded"]
        : ["Quota checked", "Within limits"],
    errorsFn: (l) =>
      l.outcome === "rate_limited"
        ? ["Rate limit exceeded — request dropped"]
        : [],
  },
  {
    name: "Tool registry lookup",
    baseOffset: 24,
    baseDuration: 3,
    statusFn: (l) =>
      !l.tool_name ? "warn" : "ok",
    attrsFn: (l) => ({
      "tool.name": l.tool_name ?? "unknown",
      "tool.server": l.server_slug ?? "—",
      "tool.rpc": l.rpc_method ?? "—",
    }),
    logsFn: (l) =>
      !l.tool_name
        ? ["Tool not found in registry"]
        : [`Tool "${l.tool_name}" resolved`, "Schema loaded"],
    errorsFn: (l) =>
      !l.tool_name ? ["Tool not registered — proxying blind"] : [],
  },
  {
    name: "Upstream connection",
    baseOffset: 28,
    baseDuration: 12,
    statusFn: (l) =>
      l.outcome === "error" ? "warn" : "ok",
    attrsFn: (l) => ({
      "upstream.server": l.server_slug ?? "—",
      "upstream.transport": "http",
      "upstream.status": l.outcome === "error" ? "degraded" : "healthy",
    }),
    logsFn: () => ["TCP connect", "TLS handshake", "Connection pooled"],
    errorsFn: (l) =>
      l.outcome === "error" ? ["Upstream responded slowly"] : [],
  },
  {
    name: "Tool execution",
    baseOffset: 41,
    baseDuration: 35,
    statusFn: (l) =>
      l.outcome === "error" || l.outcome === "failure" ? "error"
      : l.outcome === "warn" ? "warn"
      : "ok",
    attrsFn: (l) => ({
      "tool.name": l.tool_name ?? "—",
      "tool.server": l.server_slug ?? "—",
      "exec.outcome": l.outcome ?? "success",
      "exec.rpc": l.rpc_method ?? "—",
    }),
    logsFn: (l) =>
      l.outcome === "error"
        ? ["Tool invoked", "Upstream returned error"]
        : ["Tool invoked", "Response received", "Parsing result"],
    errorsFn: (l) =>
      l.outcome === "error" ? [l.detail ? JSON.stringify(l.detail) : "Tool execution failed"] : [],
  },
  {
    name: "Response filtering",
    baseOffset: 77,
    baseDuration: 5,
    statusFn: () => "ok",
    attrsFn: () => ({
      "filter.pii": "active",
      "filter.redact_secrets": "active",
    }),
    logsFn: () => ["PII scan complete", "Secrets redacted", "Response approved"],
    errorsFn: () => [],
  },
  {
    name: "Audit event",
    baseOffset: 83,
    baseDuration: 2,
    statusFn: () => "ok",
    attrsFn: (l) => ({
      "audit.event_type": l.event_type ?? "tool_call",
      "audit.outcome": l.outcome ?? "success",
      "audit.id": l.id ?? "—",
    }),
    logsFn: () => ["Audit record written"],
    errorsFn: () => [],
  },
];

function buildTrace(log: AuditLogView): Trace {
  const isError =
    log.event_type === AuditEventType.auth_failure ||
    log.event_type === AuditEventType.rbac_deny ||
    log.outcome === "error" ||
    log.outcome === "failure" ||
    log.outcome === "rate_limited";

  // Truncate spans at the first hard failure
  let cutAfter = SPAN_DEFINITIONS.length;
  if (log.event_type === AuditEventType.auth_failure) cutAfter = 2;
  else if (log.event_type === AuditEventType.rbac_deny) cutAfter = 3;
  else if (log.outcome === "rate_limited") cutAfter = 4;

  const spans: Span[] = SPAN_DEFINITIONS.slice(0, cutAfter).map((def, i) => ({
    id: `${log.id ?? i}-span-${i}`,
    name: def.name,
    startOffset: def.baseOffset,
    duration: def.baseDuration,
    status: def.statusFn(log),
    attributes: def.attrsFn(log),
    logs: def.logsFn(log),
    errors: def.errorsFn(log),
  }));

  const totalDuration = spans.reduce(
    (max, s) => Math.max(max, s.startOffset + s.duration),
    0,
  );

  return {
    id: log.request_id ?? log.id ?? "unknown",
    tool: log.tool_name ?? "—",
    server: log.server_slug ?? "—",
    user: log.subject_id
      ? log.subject_id.slice(0, 8) + "…"
      : "—",
    outcome: isError ? "error" : "success",
    startTime: log.created_at ?? new Date().toISOString(),
    totalDuration,
    spans,
    raw: log,
  };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok: <CheckCircle2 size={14} style={{ color: "var(--pc-success)" }} />,
  error: <XCircle size={14} style={{ color: "var(--pc-critical)" }} />,
  warn: <AlertTriangle size={14} style={{ color: "var(--pc-warning)" }} />,
};

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--pc-success)",
  error: "var(--pc-critical)",
  warn: "var(--pc-warning)",
};

/* ── waterfall ───────────────────────────────────────────────────────────── */

function WaterfallBar({
  span,
  totalDuration,
  isExpanded,
  onToggle,
}: {
  span: Span;
  totalDuration: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const leftPct = totalDuration > 0 ? (span.startOffset / totalDuration) * 100 : 0;
  const widthPct = totalDuration > 0 ? (span.duration / totalDuration) * 100 : 2;

  return (
    <div>
      {/* row */}
      <button
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr 80px",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "8px 12px",
          background: isExpanded ? "var(--pc-elevated)" : "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* label */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isExpanded ? (
            <ChevronDown size={12} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={12} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
          )}
          {STATUS_ICON[span.status]}
          <span style={{ fontSize: 12, color: "var(--pc-foreground)", fontWeight: 500 }}>
            {span.name}
          </span>
        </div>

        {/* bar track */}
        <div
          style={{
            position: "relative",
            height: 18,
            background: "var(--pc-bg)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: `${leftPct}%`,
              width: `${Math.max(widthPct, 1)}%`,
              height: "100%",
              background: STATUS_COLOR[span.status],
              opacity: 0.8,
              borderRadius: 3,
            }}
          />
        </div>

        {/* duration */}
        <span style={{ fontSize: 11, color: "var(--pc-muted)", textAlign: "right" }}>
          {span.duration}ms
        </span>
      </button>

      {/* expanded detail */}
      {isExpanded && (
        <div
          style={{
            margin: "4px 12px 8px 220px",
            padding: 12,
            background: "var(--pc-bg)",
            borderRadius: 6,
            border: "1px solid var(--pc-border)",
            fontSize: 12,
          }}
        >
          {/* tabs: attributes / logs / errors */}
          <SpanDetail span={span} />
        </div>
      )}
    </div>
  );
}

function SpanDetail({ span }: { span: Span }) {
  const [tab, setTab] = useState<"attrs" | "logs" | "errors">("attrs");

  const tabs: Array<{ id: "attrs" | "logs" | "errors"; label: string; count?: number }> = [
    { id: "attrs", label: "Attributes" },
    { id: "logs", label: "Logs", count: span.logs.length },
    { id: "errors", label: "Errors", count: span.errors.length },
  ];

  return (
    <div>
      {/* tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "3px 10px",
              borderRadius: 4,
              border: "1px solid var(--pc-border)",
              background: tab === t.id ? "var(--pc-elevated)" : "transparent",
              color: tab === t.id ? "var(--pc-foreground)" : "var(--pc-muted)",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {t.id === "attrs" && <Tag size={10} />}
            {t.id === "logs" && <Terminal size={10} />}
            {t.id === "errors" && <XCircle size={10} />}
            {t.label}
            {t.count !== undefined && (
              <span
                style={{
                  background: "var(--pc-border)",
                  borderRadius: 8,
                  padding: "0 5px",
                  fontSize: 10,
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "attrs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(span.attributes).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "var(--pc-muted)", minWidth: 180, flexShrink: 0 }}>{k}</span>
              <span style={{ color: "var(--pc-foreground)", fontFamily: "monospace", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "logs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {span.logs.length === 0 ? (
            <span style={{ color: "var(--pc-muted)" }}>No logs</span>
          ) : (
            span.logs.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: "var(--pc-muted)", flexShrink: 0 }}>›</span>
                <span style={{ color: "var(--pc-foreground)", fontFamily: "monospace" }}>{l}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "errors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {span.errors.length === 0 ? (
            <span style={{ color: "var(--pc-muted)" }}>No errors</span>
          ) : (
            span.errors.map((e, i) => (
              <div
                key={i}
                style={{
                  padding: "6px 8px",
                  background: "rgba(240,93,94,0.1)",
                  border: "1px solid rgba(240,93,94,0.3)",
                  borderRadius: 4,
                  color: "var(--pc-critical)",
                  fontFamily: "monospace",
                }}
              >
                {e}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── trace detail panel ──────────────────────────────────────────────────── */

function TraceDetail({ trace, onBack }: { trace: Trace; onBack: () => void }) {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  function toggleSpan(id: string) {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const errorCount = trace.spans.filter((s) => s.status === "error").length;
  const warnCount = trace.spans.filter((s) => s.status === "warn").length;

  return (
    <div>
      {/* back */}
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "var(--pc-muted)",
          cursor: "pointer",
          fontSize: 13,
          padding: "0 0 16px 0",
        }}
      >
        <ArrowLeft size={14} />
        Back to traces
      </button>

      {/* header */}
      <div
        style={{
          padding: 20,
          background: "var(--pc-surface)",
          borderRadius: 8,
          border: "1px solid var(--pc-border)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>Trace ID</div>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--pc-foreground)" }}>
              {trace.id}
            </div>
          </div>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background:
                trace.outcome === "error"
                  ? "rgba(240,93,94,0.15)"
                  : "rgba(53,200,138,0.15)",
              color:
                trace.outcome === "error"
                  ? "var(--pc-critical)"
                  : "var(--pc-success)",
            }}
          >
            {trace.outcome.toUpperCase()}
          </span>
        </div>

        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {[
            { label: "Tool", value: trace.tool },
            { label: "Server", value: trace.server },
            { label: "User", value: trace.user },
            { label: "Started", value: fmtTime(trace.startTime) },
            { label: "Duration", value: `${trace.totalDuration}ms` },
            { label: "Spans", value: String(trace.spans.length) },
            { label: "Errors", value: String(errorCount), warn: errorCount > 0 },
            { label: "Warnings", value: String(warnCount), warn: warnCount > 0 },
          ].map(({ label, value, warn }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 2 }}>{label}</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: warn ? "var(--pc-warning)" : "var(--pc-foreground)",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* waterfall */}
      <div
        style={{
          padding: 16,
          background: "var(--pc-surface)",
          borderRadius: 8,
          border: "1px solid var(--pc-border)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px 1fr 80px",
            gap: 12,
            padding: "0 12px 8px 12px",
            borderBottom: "1px solid var(--pc-border)",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--pc-muted)", fontWeight: 600 }}>SPAN</span>
          <span style={{ fontSize: 11, color: "var(--pc-muted)", fontWeight: 600 }}>TIMELINE (0 – {trace.totalDuration}ms)</span>
          <span style={{ fontSize: 11, color: "var(--pc-muted)", fontWeight: 600, textAlign: "right" }}>DUR.</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {trace.spans.map((span) => (
            <WaterfallBar
              key={span.id}
              span={span}
              totalDuration={trace.totalDuration}
              isExpanded={expandedSpans.has(span.id)}
              onToggle={() => toggleSpan(span.id)}
            />
          ))}
        </div>
      </div>

      {/* raw detail */}
      <details
        style={{
          marginTop: 12,
          padding: 16,
          background: "var(--pc-surface)",
          borderRadius: 8,
          border: "1px solid var(--pc-border)",
        }}
      >
        <summary
          style={{ cursor: "pointer", fontSize: 12, color: "var(--pc-muted)", userSelect: "none" }}
        >
          Raw audit record
        </summary>
        <pre
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--pc-foreground)",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {JSON.stringify(trace.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function TracesPage() {
  const logsQuery = useListAuditLogsV1AuditGet({ limit: 200 });
  const serversQuery = useListServersV1ServersGet();

  const logs = (logsQuery.data?.data ?? []) as AuditLogView[];
  const servers = (serversQuery.data?.data ?? []) as import("@/api/generated").ServerView[];

  const serverSlugs = useMemo(
    () => [...new Set(servers.map((s) => s.slug).filter(Boolean) as string[])],
    [servers],
  );

  // filters
  const [search, setSearch] = useState("");
  const [filterServer, setFilterServer] = useState("");
  const [filterOutcome, setFilterOutcome] = useState<"" | "success" | "error">("");
  const [filterTool, setFilterTool] = useState("");
  const [minDuration, setMinDuration] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // selected trace
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

  const traces = useMemo<Trace[]>(() => logs.map(buildTrace), [logs]);

  const filtered = useMemo(() => {
    let result = traces;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.tool.toLowerCase().includes(q) ||
          t.server.toLowerCase().includes(q) ||
          t.user.toLowerCase().includes(q),
      );
    }
    if (filterServer) result = result.filter((t) => t.server === filterServer);
    if (filterOutcome) result = result.filter((t) => t.outcome === filterOutcome);
    if (filterTool) {
      const q = filterTool.toLowerCase();
      result = result.filter((t) => t.tool.toLowerCase().includes(q));
    }
    if (minDuration) {
      const min = Number(minDuration);
      if (!isNaN(min)) result = result.filter((t) => t.totalDuration >= min);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((t) => new Date(t.startTime).getTime() >= from);
    }

    return result;
  }, [traces, search, filterServer, filterOutcome, filterTool, minDuration, dateFrom]);

  if (selectedTrace) {
    return (
      <div
        style={{
          padding: 24,
          minHeight: "100vh",
          background: "var(--pc-bg)",
          color: "var(--pc-foreground)",
        }}
      >
        <TraceDetail trace={selectedTrace} onBack={() => setSelectedTrace(null)} />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "var(--pc-bg)",
        color: "var(--pc-foreground)",
      }}
    >
      {/* header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Layers size={20} style={{ color: "var(--pc-primary)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Trace Explorer</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          Distributed traces synthesized from audit events — click any row to view the full span waterfall.
        </p>
      </div>

      {/* search bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pc-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by trace ID, tool, server, user…"
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-foreground)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: showFilters ? "var(--pc-elevated)" : "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <Filter size={14} />
          Filters
        </button>
        <button
          onClick={() => logsQuery.refetch()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* filter panel */}
      {showFilters && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
            padding: 14,
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              Server
            </label>
            <select
              value={filterServer}
              onChange={(e) => setFilterServer(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            >
              <option value="">All servers</option>
              {serverSlugs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              Outcome
            </label>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value as "" | "success" | "error")}
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            >
              <option value="">All outcomes</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              Tool name
            </label>
            <input
              value={filterTool}
              onChange={(e) => setFilterTool(e.target.value)}
              placeholder="e.g. search, fetch"
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              Min duration (ms)
            </label>
            <input
              type="number"
              value={minDuration}
              onChange={(e) => setMinDuration(e.target.value)}
              placeholder="e.g. 200"
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              From date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() => {
                setFilterServer("");
                setFilterOutcome("");
                setFilterTool("");
                setMinDuration("");
                setDateFrom("");
              }}
              style={{
                padding: "6px 12px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* results count */}
      <div style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 10 }}>
        {logsQuery.isLoading ? "Loading…" : `${filtered.length} traces`}
        {filtered.length !== traces.length && ` (filtered from ${traces.length})`}
      </div>

      {/* table */}
      <div
        style={{
          background: "var(--pc-surface)",
          borderRadius: 8,
          border: "1px solid var(--pc-border)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
              {["Trace ID", "Tool", "Server", "User", "Duration", "Spans", "Outcome", "Time"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--pc-muted)",
                      textAlign: "left",
                      background: "var(--pc-elevated)",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {logsQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} style={{ padding: "10px 14px" }}>
                      <Skeleton style={{ height: 14, width: "80%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--pc-muted)",
                    fontSize: 13,
                  }}
                >
                  No traces found
                </td>
              </tr>
            ) : (
              filtered.map((trace, i) => (
                <tr
                  key={trace.id + i}
                  onClick={() => setSelectedTrace(trace)}
                  style={{
                    borderBottom: "1px solid var(--pc-border)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "var(--pc-elevated)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "var(--pc-secondary)",
                      }}
                    >
                      {trace.id.slice(0, 16)}…
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>{trace.tool}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>{trace.server}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--pc-muted)" }}>
                      {trace.user}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>
                    <span
                      style={{
                        color:
                          trace.totalDuration > 500
                            ? "var(--pc-warning)"
                            : "var(--pc-foreground)",
                      }}
                    >
                      {trace.totalDuration}ms
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--pc-muted)" }}>
                    {trace.spans.length}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          trace.outcome === "error"
                            ? "rgba(240,93,94,0.15)"
                            : "rgba(53,200,138,0.15)",
                        color:
                          trace.outcome === "error"
                            ? "var(--pc-critical)"
                            : "var(--pc-success)",
                      }}
                    >
                      {trace.outcome}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      fontSize: 11,
                      color: "var(--pc-muted)",
                    }}
                  >
                    {relativeTime(trace.startTime)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* note */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--pc-muted)",
        }}
      >
        <Info size={12} />
        Traces are synthesized from audit log events. Real distributed tracing requires OpenTelemetry instrumentation on the Portcullis gateway.
      </div>
    </div>
  );
}
