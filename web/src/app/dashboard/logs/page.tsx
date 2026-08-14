"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  X,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Copy,
  CheckCircle2,
  Clock,
  Shield,
  ShieldOff,
  AlertTriangle,
  Server,
  Wrench,
  User,
  Globe,
  FileText,
  Activity,
  Hash,
  Lock,
  Unlock,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Info,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  type AuditLogView,
  AuditEventType,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => { /* noop */ });
}

/* ── badge components ────────────────────────────────────────────────────── */

function StatusBadge({ outcome }: { outcome: string }) {
  const isOk = outcome === "allowed" || outcome === "success";
  const isWarn = outcome === "rate_limited";
  const color = isOk ? "var(--pc-success)" : isWarn ? "var(--pc-warning)" : "var(--pc-critical)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {outcome}
    </span>
  );
}

function EventBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    tool_call: { label: "Tool Call", color: "var(--pc-success)", icon: <Wrench size={10} /> },
    rbac_deny: { label: "RBAC Deny", color: "var(--pc-critical)", icon: <ShieldOff size={10} /> },
    auth_failure: { label: "Auth Fail", color: "var(--pc-warning)", icon: <Lock size={10} /> },
  };
  const { label, color, icon } = map[type] ?? { label: type, color: "var(--pc-muted)", icon: null };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` }}>
      {icon}{label}
    </span>
  );
}

/* ── timeline step ───────────────────────────────────────────────────────── */

function TimelineStep({
  icon,
  label,
  detail,
  status,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  status: "success" | "error" | "warning" | "neutral" | "pending";
  mono?: boolean;
}) {
  const colorMap = {
    success: "var(--pc-success)",
    error: "var(--pc-critical)",
    warning: "var(--pc-warning)",
    neutral: "var(--pc-secondary)",
    pending: "var(--pc-muted)",
  };
  const color = colorMap[status];

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${color}18`, border: `1.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
        <div style={{ width: 1.5, flex: 1, background: "var(--pc-border)", minHeight: 12, marginTop: 3 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: detail ? 3 : 0 }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 11, color: "var(--pc-muted)", fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.5 }}>{detail}</div>
        )}
      </div>
    </div>
  );
}

/* ── detail drawer ───────────────────────────────────────────────────────── */

function DetailDrawer({ log, onClose }: { log: AuditLogView; onClose: () => void }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("trace");

  function copy(text: string, field: string) {
    copyToClipboard(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function toggleSection(s: string) {
    setExpandedSection(prev => prev === s ? null : s);
  }

  // Determine trace state from event type
  const traceSteps: Array<{ icon: React.ReactNode; label: string; detail?: string; status: "success" | "error" | "warning" | "neutral" | "pending"; mono?: boolean }> = [
    {
      icon: <ArrowDownLeft size={11} />,
      label: "Request received",
      detail: `${log.client_ip ?? "unknown IP"} · ${new Date(log.created_at).toISOString()}`,
      status: "neutral",
      mono: true,
    },
    {
      icon: <Lock size={11} />,
      label: log.event_type === AuditEventType.auth_failure ? "Authentication failed" : "Authentication passed",
      detail: log.subject_id ? `Subject: ${log.subject_id}` : "No subject",
      status: log.event_type === AuditEventType.auth_failure ? "error" : "success",
      mono: true,
    },
    ...(log.event_type !== AuditEventType.auth_failure ? [{
      icon: <Shield size={11} />,
      label: log.event_type === AuditEventType.rbac_deny ? "Policy evaluation: DENY" : "Policy evaluation: ALLOW",
      detail: log.event_type === AuditEventType.rbac_deny
        ? `RBAC rule denied ${log.tool_name ?? "tool"} on ${log.server_slug ?? "server"}`
        : `Tool call permitted by role policy`,
      status: (log.event_type === AuditEventType.rbac_deny ? "error" : "success") as "error" | "success",
    }] : []),
    ...(log.event_type === AuditEventType.tool_call ? [
      {
        icon: <ArrowUpRight size={11} />,
        label: "Upstream request dispatched",
        detail: `${log.server_slug ?? "unknown"} → ${log.tool_name ?? "unknown tool"}`,
        status: "neutral" as const,
        mono: true,
      },
      {
        icon: <ArrowDownLeft size={11} />,
        label: `Upstream response: ${log.outcome}`,
        detail: log.rpc_method ? `RPC: ${log.rpc_method}` : undefined,
        status: (log.outcome === "allowed" || log.outcome === "success" ? "success" : "error") as "success" | "error",
      },
    ] : []),
  ];

  const metaRows = [
    { label: "Event ID", value: log.id, copyable: true },
    { label: "Request ID", value: log.request_id ?? "—", copyable: !!log.request_id },
    { label: "Tenant", value: log.tenant_id ?? "—" },
    { label: "Event Type", value: log.event_type },
    { label: "Created At", value: new Date(log.created_at).toISOString() },
  ];

  const authRows = [
    { label: "Subject ID", value: log.subject_id ?? "—", copyable: !!log.subject_id },
    { label: "Subject Type", value: log.subject_type ?? "—" },
    { label: "Client IP", value: log.client_ip ?? "—" },
    { label: "Auth Result", value: log.event_type === AuditEventType.auth_failure ? "FAILED" : "PASSED" },
  ];

  const requestRows = [
    { label: "Server", value: log.server_slug ?? "—" },
    { label: "Tool", value: log.tool_name ?? "—" },
    { label: "RPC Method", value: log.rpc_method ?? "—" },
    { label: "Outcome", value: log.outcome },
  ];

  const detailKeys = Object.keys(log.detail ?? {});

  function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
    const open = expandedSection === id;
    return (
      <div style={{ borderBottom: "1px solid var(--pc-border)" }}>
        <button
          onClick={() => toggleSection(id)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ color: "var(--pc-muted)" }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-foreground)", flex: 1 }}>{title}</span>
          {open ? <ChevronDown size={13} style={{ color: "var(--pc-muted)" }} /> : <ChevronRight size={13} style={{ color: "var(--pc-muted)" }} />}
        </button>
        {open && <div style={{ padding: "0 16px 14px" }}>{children}</div>}
      </div>
    );
  }

  function MetaTable({ rows }: { rows: { label: string; value: string; copyable?: boolean }[] }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)", overflow: "hidden" }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: i < rows.length - 1 ? "1px solid var(--pc-border)" : "none" }}>
            <span style={{ fontSize: 11, color: "var(--pc-muted)", flexShrink: 0 }}>{row.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--pc-foreground)", fontFamily: "monospace", textAlign: "right", wordBreak: "break-all" }}>{row.value}</span>
              {row.copyable && row.value !== "—" && (
                <button onClick={() => copy(row.value, row.label)} style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: copiedField === row.label ? "var(--pc-primary)" : "var(--pc-muted)", flexShrink: 0 }}>
                  {copiedField === row.label ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 440, background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRight: "none", borderTop: "none", borderBottom: "none", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px #00000040" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px", borderBottom: "1px solid var(--pc-border)", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-foreground)", marginBottom: 4 }}>Request Detail</div>
          <div style={{ display: "flex", gap: 6 }}>
            <EventBadge type={log.event_type} />
            <StatusBadge outcome={log.outcome} />
          </div>
        </div>
        <button onClick={onClose} style={{ padding: 6, background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, cursor: "pointer", color: "var(--pc-muted)" }}>
          <X size={14} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: 16, borderBottom: "1px solid var(--pc-border)" }}>
          {[
            { label: "Time", value: relativeTime(log.created_at), icon: <Clock size={12} /> },
            { label: "Duration", value: "—", icon: <Activity size={12} /> },
            { label: "Region", value: "—", icon: <Globe size={12} /> },
          ].map(item => (
            <div key={item.label} style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--pc-muted)", marginBottom: 4 }}>{item.icon}<span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{item.label}</span></div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-foreground)", fontFamily: "monospace" }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Trace timeline */}
        <Section id="trace" title="Trace Timeline" icon={<Activity size={13} />}>
          <div style={{ paddingTop: 8 }}>
            {traceSteps.map((step, i) => (
              <TimelineStep key={i} {...step} />
            ))}
          </div>
        </Section>

        {/* Request metadata */}
        <Section id="meta" title="Request Metadata" icon={<Hash size={13} />}>
          <MetaTable rows={metaRows} />
        </Section>

        {/* Authentication */}
        <Section id="auth" title="Authentication" icon={<Lock size={13} />}>
          <MetaTable rows={authRows} />
          {log.event_type === AuditEventType.auth_failure && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#F4B94212", border: "1px solid #F4B94230", borderRadius: 6, display: "flex", gap: 8 }}>
              <AlertTriangle size={13} style={{ color: "var(--pc-warning)", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: "var(--pc-warning)", margin: 0, lineHeight: 1.5 }}>Authentication failed. The API key may be invalid, revoked, or expired.</p>
            </div>
          )}
        </Section>

        {/* Policy evaluation */}
        <Section id="policy" title="Policy Evaluation" icon={<Shield size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ padding: "10px 12px", background: log.event_type === AuditEventType.rbac_deny ? "#F05D5E12" : log.event_type === AuditEventType.auth_failure ? "#F4B94212" : "#35C88A12", border: `1px solid ${log.event_type === AuditEventType.rbac_deny ? "#F05D5E30" : log.event_type === AuditEventType.auth_failure ? "#F4B94230" : "#35C88A30"}`, borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: log.event_type === AuditEventType.rbac_deny ? "var(--pc-critical)" : log.event_type === AuditEventType.auth_failure ? "var(--pc-warning)" : "var(--pc-success)", marginBottom: 3 }}>
                {log.event_type === AuditEventType.tool_call ? "✓ Request permitted" : log.event_type === AuditEventType.rbac_deny ? "✗ Request denied by RBAC" : "✗ Authentication failed — policy not evaluated"}
              </div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", lineHeight: 1.5 }}>
                {log.event_type === AuditEventType.tool_call
                  ? `Tool "${log.tool_name}" on "${log.server_slug}" was allowed by role policy.`
                  : log.event_type === AuditEventType.rbac_deny
                  ? `No role permission grants this subject access to "${log.tool_name}" on "${log.server_slug}".`
                  : "Request was rejected before policy evaluation."}
              </div>
            </div>
            <MetaTable rows={[
              { label: "Server Pattern", value: log.server_slug ?? "—" },
              { label: "Tool Pattern", value: log.tool_name ?? "—" },
              { label: "Decision", value: log.event_type === AuditEventType.tool_call ? "allow" : "deny" },
            ]} />
          </div>
        </Section>

        {/* Upstream request/response */}
        <Section id="upstream" title="Upstream Request" icon={<ArrowUpRight size={13} />}>
          {log.event_type !== AuditEventType.tool_call ? (
            <div style={{ padding: "12px", textAlign: "center", color: "var(--pc-muted)", fontSize: 12 }}>
              Request was denied before reaching the upstream MCP server.
            </div>
          ) : (
            <MetaTable rows={[
              { label: "Server", value: log.server_slug ?? "—" },
              { label: "Tool", value: log.tool_name ?? "—" },
              { label: "RPC Method", value: log.rpc_method ?? "tools/call" },
              { label: "Outcome", value: log.outcome },
            ]} />
          )}
        </Section>

        {/* Upstream response */}
        <Section id="response" title="Upstream Response" icon={<ArrowDownLeft size={13} />}>
          {log.event_type !== AuditEventType.tool_call ? (
            <div style={{ padding: "12px", textAlign: "center", color: "var(--pc-muted)", fontSize: 12 }}>
              No upstream response — request did not reach the server.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <MetaTable rows={[
                { label: "Status", value: log.outcome },
                { label: "Duration", value: "— (not captured)" },
              ]} />
              <div style={{ padding: "10px 12px", background: "#48B8E812", border: "1px solid #48B8E830", borderRadius: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Info size={12} style={{ color: "var(--pc-secondary)", flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0, lineHeight: 1.4 }}>Response payload is not stored for privacy. Add observability middleware to capture upstream responses.</p>
              </div>
            </div>
          )}
        </Section>

        {/* Redacted payload */}
        <Section id="payload" title="Redacted Payload" icon={<FileText size={13} />}>
          <div style={{ padding: "12px 14px", background: "#0A0F14", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
            <pre style={{ margin: 0, fontSize: 11, fontFamily: "monospace", color: "var(--pc-muted)", lineHeight: 1.6 }}>
              {JSON.stringify({
                method: log.rpc_method ?? "tools/call",
                params: {
                  name: log.tool_name ?? "<redacted>",
                  arguments: "<redacted>",
                },
                id: 1,
              }, null, 2)}
            </pre>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--pc-muted)", lineHeight: 1.4 }}>
            Argument values are redacted. Enable payload logging in server settings to capture inputs.
          </div>
        </Section>

        {/* Detail / extra fields */}
        {detailKeys.length > 0 && (
          <Section id="detail" title="Extra Detail" icon={<Info size={13} />}>
            <MetaTable rows={detailKeys.map(k => ({ label: k, value: String((log.detail as Record<string, unknown>)[k] ?? "—") }))} />
          </Section>
        )}

        {/* Retry attempts */}
        <Section id="retry" title="Retry Attempts" icon={<RotateCcw size={13} />}>
          <div style={{ padding: "12px", textAlign: "center", color: "var(--pc-muted)", fontSize: 12 }}>
            Retry tracking is not yet captured. 0 retries recorded.
          </div>
        </Section>

        {/* Error details */}
        {(log.event_type === AuditEventType.auth_failure || log.event_type === AuditEventType.rbac_deny) && (
          <Section id="errors" title="Error Details" icon={<AlertTriangle size={13} />}>
            <div style={{ padding: "10px 12px", background: "#F05D5E12", border: "1px solid #F05D5E30", borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-critical)", marginBottom: 4 }}>
                {log.event_type === AuditEventType.auth_failure ? "Authentication Error" : "Authorization Error"}
              </div>
              <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>
                {log.event_type === AuditEventType.auth_failure
                  ? "The provided API key was not recognized or has been revoked. Verify the Authorization header."
                  : `The authenticated subject does not have permission to call "${log.tool_name}" on "${log.server_slug}". Assign the appropriate role.`}
              </p>
            </div>
          </Section>
        )}

        {/* Related audit events */}
        <Section id="related" title="Related Audit Events" icon={<Activity size={13} />}>
          <div style={{ padding: "12px", textAlign: "center", color: "var(--pc-muted)", fontSize: 12 }}>
            {log.subject_id
              ? `Events from subject ${log.subject_id.slice(0, 12)}… are shown in the Request Logs table with identity filter.`
              : "No subject ID available for correlation."}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── filters bar ─────────────────────────────────────────────────────────── */

interface Filters {
  search: string;
  eventType: string;
  serverSlug: string;
  outcome: string;
  timeRange: "1h" | "6h" | "24h" | "all";
}

const DEFAULT_FILTERS: Filters = { search: "", eventType: "", serverSlug: "", outcome: "", timeRange: "all" };

/* ── main page ───────────────────────────────────────────────────────────── */

export default function RequestLogsPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedLog, setSelectedLog] = useState<AuditLogView | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  function setFilter<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters(f => ({ ...f, [k]: v }));
    setPage(0);
  }

  const hasFilters = filters.search || filters.eventType || filters.serverSlug || filters.outcome || filters.timeRange !== "all";

  // API call — use real filters where available
  const auditQuery = useListAuditLogsV1AuditGet({
    limit: 200,
    ...(filters.eventType ? { event_type: filters.eventType as typeof AuditEventType[keyof typeof AuditEventType] } : {}),
    ...(filters.serverSlug ? { server_slug: filters.serverSlug } : {}),
  }, { query: { refetchInterval: 30_000 } });

  const serversQuery = useListServersV1ServersGet();
  const servers = useMemo(() => (serversQuery.data?.data ?? []) as Array<{ slug: string; name: string }>, [serversQuery.data]);

  const allLogs = useMemo(() => (auditQuery.data?.data ?? []) as AuditLogView[], [auditQuery.data]);

  // Client-side filters
  const filtered = useMemo(() => {
    let result = allLogs;

    // Time range
    if (filters.timeRange !== "all") {
      const ms = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000 }[filters.timeRange] ?? Infinity;
      result = result.filter(l => Date.now() - new Date(l.created_at).getTime() < ms);
    }

    // Outcome
    if (filters.outcome) result = result.filter(l => l.outcome === filters.outcome);

    // Search: request_id, subject_id, tool_name, server_slug
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(l =>
        l.id.toLowerCase().includes(q) ||
        (l.request_id ?? "").toLowerCase().includes(q) ||
        (l.subject_id ?? "").toLowerCase().includes(q) ||
        (l.tool_name ?? "").toLowerCase().includes(q) ||
        (l.server_slug ?? "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [allLogs, filters]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const isLoading = auditQuery.isLoading;

  const inputStyle: React.CSSProperties = {
    background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6,
    padding: "7px 10px", fontSize: 12, color: "var(--pc-foreground)", outline: "none",
  };

  const handleRowClick = useCallback((log: AuditLogView) => {
    setSelectedLog(prev => prev?.id === log.id ? null : log);
  }, []);

  return (
    <div style={{ maxWidth: selectedLog ? "100%" : 1200, margin: "0 auto", padding: "32px 24px", paddingRight: selectedLog ? 460 : 24, transition: "padding-right 0.2s" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)", margin: 0, marginBottom: 4 }}>Request Logs</h1>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>
            {filtered.length} of {allLogs.length} events
            {hasFilters && " (filtered)"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => auditQuery.refetch()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pc-muted)" }} />
          <input
            style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
            placeholder="Search by ID, subject, tool, server…"
            value={filters.search}
            onChange={e => setFilter("search", e.target.value)}
          />
        </div>

        {/* Event type */}
        <select value={filters.eventType} onChange={e => setFilter("eventType", e.target.value)} style={inputStyle}>
          <option value="">All Events</option>
          <option value="tool_call">Tool Call</option>
          <option value="rbac_deny">RBAC Deny</option>
          <option value="auth_failure">Auth Failure</option>
        </select>

        {/* Server */}
        <select value={filters.serverSlug} onChange={e => setFilter("serverSlug", e.target.value)} style={inputStyle}>
          <option value="">All Servers</option>
          {servers.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>

        {/* Outcome */}
        <select value={filters.outcome} onChange={e => setFilter("outcome", e.target.value)} style={inputStyle}>
          <option value="">All Outcomes</option>
          <option value="allowed">allowed</option>
          <option value="denied">denied</option>
          <option value="success">success</option>
          <option value="rate_limited">rate_limited</option>
        </select>

        {/* Time range */}
        <select value={filters.timeRange} onChange={e => setFilter("timeRange", e.target.value as Filters["timeRange"])} style={inputStyle}>
          <option value="all">All time</option>
          <option value="1h">Last 1h</option>
          <option value="6h">Last 6h</option>
          <option value="24h">Last 24h</option>
        </select>

        {/* Clear */}
        {hasFilters && (
          <button onClick={() => { setFilters(DEFAULT_FILTERS); setPage(0); }}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        {isLoading ? (
          <div style={{ padding: 16 }}>
            {[...Array(8)].map((_, i) => <Skeleton key={i} style={{ height: 40, borderRadius: 6, marginBottom: 6 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--pc-muted)", fontSize: 13 }}>
            <Filter size={28} style={{ marginBottom: 12, color: "var(--pc-border)" }} />
            <div>No logs match the current filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pc-border)", background: "var(--pc-bg)" }}>
                  {["Timestamp", "Request ID", "Identity", "Tool", "Server", "Status", "Policy Result", "Duration", "Region"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((log, i) => {
                  const isSelected = selectedLog?.id === log.id;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => handleRowClick(log)}
                      style={{
                        borderBottom: i < paged.length - 1 ? "1px solid var(--pc-border)" : "none",
                        background: isSelected ? "#2DD4A70A" : "transparent",
                        cursor: "pointer",
                        borderLeft: isSelected ? "2px solid var(--pc-primary)" : "2px solid transparent",
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#1B232C"; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ fontSize: 11, color: "var(--pc-foreground)", fontFamily: "monospace" }}>{fmtTimestamp(log.created_at)}</div>
                        <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>{relativeTime(log.created_at)}</div>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <code style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-muted)" }}>
                          {log.request_id ? `${log.request_id.slice(0, 12)}…` : "—"}
                        </code>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <User size={11} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                          <code style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pc-secondary)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                            {log.subject_id ? `${log.subject_id.slice(0, 10)}…` : "anon"}
                          </code>
                        </div>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <code style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {log.tool_name ?? log.rpc_method ?? "—"}
                        </code>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <code style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pc-primary)", whiteSpace: "nowrap" }}>
                          {log.server_slug ?? "—"}
                        </code>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <StatusBadge outcome={log.outcome} />
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <EventBadge type={log.event_type} />
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: "var(--pc-muted)", fontFamily: "monospace" }}>—</td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: "var(--pc-muted)" }}>—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
          <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>
            Page {page + 1} of {totalPages} · {filtered.length} results
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: "6px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: page === 0 ? "var(--pc-muted)" : "var(--pc-foreground)", cursor: page === 0 ? "not-allowed" : "pointer", opacity: page === 0 ? 0.5 : 1 }}
            >
              ← Prev
            </button>
            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
              const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  style={{ padding: "6px 10px", background: pageNum === page ? "var(--pc-primary)" : "var(--pc-elevated)", border: `1px solid ${pageNum === page ? "var(--pc-primary)" : "var(--pc-border)"}`, borderRadius: 6, fontSize: 12, color: pageNum === page ? "#0C1116" : "var(--pc-foreground)", cursor: "pointer", fontWeight: pageNum === page ? 700 : 400, minWidth: 32 }}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: "6px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: page >= totalPages - 1 ? "var(--pc-muted)" : "var(--pc-foreground)", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", opacity: page >= totalPages - 1 ? 0.5 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selectedLog && (
        <>
          <div
            onClick={() => setSelectedLog(null)}
            style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 49 }}
          />
          <DetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </>
      )}
    </div>
  );
}
