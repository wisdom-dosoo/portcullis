"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  RefreshCw,
  Zap,
  ShieldOff,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Radio,
  Globe,
  Search,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  type AuditLogView,
  type ServerView,
  AuditEventType,
  ServerStatus,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function bucket10m(logs: AuditLogView[]): { time: string; total: number; errors: number }[] {
  if (!logs.length) return [];
  const ms = 10 * 60_000;
  const map = new Map<number, { total: number; errors: number }>();
  logs.forEach(l => {
    const t = Math.floor(new Date(l.created_at).getTime() / ms) * ms;
    const b = map.get(t) ?? { total: 0, errors: 0 };
    b.total++;
    if (l.event_type !== AuditEventType.tool_call) b.errors++;
    map.set(t, b);
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0])
    .map(([ts, v]) => ({ time: fmtTime(new Date(ts).toISOString()), ...v }));
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#1B232C", border: "1px solid #26303A", borderRadius: 6, fontSize: 11, color: "#F1F5F9",
};

/* ── metric card ─────────────────────────────────────────────────────────── */

function MetricCard({
  label, value, sub, icon, color, na, trend,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; na?: boolean; trend?: "up" | "down" | "flat";
}) {
  return (
    <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
        <span style={{ fontSize: 9, color: na ? "var(--pc-border)" : "transparent", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, border: `1px solid ${na ? "var(--pc-border)" : "transparent"}`, padding: "1px 5px", borderRadius: 3 }}>N/A</span>
      </div>
      <div style={{ fontSize: na ? 16 : 22, fontWeight: 700, color: na ? "var(--pc-muted)" : "var(--pc-foreground)", marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        {trend === "up" && <TrendingUp size={10} style={{ color: "var(--pc-success)" }} />}
        {trend === "down" && <TrendingDown size={10} style={{ color: "var(--pc-critical)" }} />}
        {trend === "flat" && <Minus size={10} style={{ color: "var(--pc-muted)" }} />}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>{sub}</div>}
    </div>
  );
}

/* ── service map ─────────────────────────────────────────────────────────── */

function ServiceMap({
  servers, logs,
}: {
  servers: ServerView[]; logs: AuditLogView[];
}) {
  const serverCounts = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => { if (l.server_slug) map.set(l.server_slug, (map.get(l.server_slug) ?? 0) + 1); });
    return map;
  }, [logs]);

  const maxCount = useMemo(() => Math.max(...serverCounts.values(), 1), [serverCounts]);

  if (servers.length === 0) {
    return (
      <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}>
        <Server size={20} style={{ marginRight: 8 }} /> No servers registered
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0", overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: servers.length * 140 }}>
        {/* Gateway node */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 100 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: "#2DD4A718", border: "2px solid var(--pc-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Radio size={20} style={{ color: "var(--pc-primary)" }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-primary)", marginTop: 6 }}>Gateway</div>
          <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>{logs.length} req</div>
        </div>

        {/* Connections to servers */}
        <div style={{ flex: 1, display: "flex", gap: 0 }}>
          {servers.map(srv => {
            const count = serverCounts.get(srv.slug) ?? 0;
            const size = Math.max(36, Math.round(36 + (count / maxCount) * 16));
            const isHealthy = srv.status === ServerStatus.active;
            const isUnhealthy = srv.status === ServerStatus.unhealthy;
            const color = isHealthy ? "var(--pc-success)" : isUnhealthy ? "var(--pc-critical)" : "var(--pc-muted)";
            return (
              <div key={srv.slug} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                {/* Line */}
                <div style={{ flex: 1, height: 2, background: count > 0 ? "var(--pc-primary)" : "var(--pc-border)", opacity: count > 0 ? 0.6 : 0.3 }} />
                {/* Server node */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: size, height: size, borderRadius: 8, background: `${color}18`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Server size={size * 0.4} style={{ color }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-foreground)", marginTop: 5, maxWidth: 80, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{srv.name}</div>
                  <div style={{ fontSize: 9, color: "var(--pc-muted)" }}>{count} req</div>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, marginTop: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── error groups panel ──────────────────────────────────────────────────── */

function ErrorGroupsPanel({ logs }: { logs: AuditLogView[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { count: number; first: string; last: string; servers: Set<string>; tools: Set<string>; event: string }>();
    logs.filter(l => l.event_type !== AuditEventType.tool_call).forEach(l => {
      const key = `${l.event_type}::${l.server_slug ?? "unknown"}::${l.outcome}`;
      const g = map.get(key) ?? { count: 0, first: l.created_at, last: l.created_at, servers: new Set(), tools: new Set(), event: l.event_type };
      g.count++;
      if (new Date(l.created_at) < new Date(g.first)) g.first = l.created_at;
      if (new Date(l.created_at) > new Date(g.last)) g.last = l.created_at;
      if (l.server_slug) g.servers.add(l.server_slug);
      if (l.tool_name) g.tools.add(l.tool_name);
      map.set(key, g);
    });
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  }, [logs]);

  if (groups.length === 0) {
    return <div style={{ padding: "20px 0", textAlign: "center", color: "var(--pc-muted)", fontSize: 12 }}>No errors in current dataset.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map(([key, g]) => {
        const isAuth = g.event === AuditEventType.auth_failure;
        const color = isAuth ? "var(--pc-warning)" : "var(--pc-critical)";
        return (
          <div key={key} style={{ padding: "10px 14px", background: "var(--pc-bg)", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>
                {isAuth ? "Auth Failure" : "RBAC Deny"} — {[...g.servers][0] ?? "unknown"}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-foreground)" }}>{g.count}×</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>
              First: {relativeTime(g.first)} · Last: {relativeTime(g.last)}
              {g.tools.size > 0 && ` · Tools: ${[...g.tools].slice(0, 2).join(", ")}`}
            </div>
          </div>
        );
      })}
      <Link href="/dashboard/observability/errors" style={{ fontSize: 12, color: "var(--pc-primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
        View all errors <ExternalLink size={11} />
      </Link>
    </div>
  );
}

/* ── unhealthy servers panel ─────────────────────────────────────────────── */

function UnhealthyServers({ servers }: { servers: ServerView[] }) {
  const unhealthy = servers.filter(s => s.status !== ServerStatus.active);
  if (unhealthy.length === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "var(--pc-muted)", fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <CheckCircle2 size={20} style={{ color: "var(--pc-success)" }} />
        All servers healthy
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {unhealthy.map(srv => {
        const isUnhealthy = srv.status === ServerStatus.unhealthy;
        const color = isUnhealthy ? "var(--pc-critical)" : "var(--pc-muted)";
        return (
          <div key={srv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--pc-bg)", border: `1px solid ${color}30`, borderRadius: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-foreground)" }}>{srv.name}</div>
              <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>
                {srv.consecutive_health_failures} consecutive failures
                {srv.last_health_check_at ? ` · last check ${relativeTime(srv.last_health_check_at)}` : ""}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}18`, padding: "2px 6px", borderRadius: 3 }}>
              {srv.status}
            </span>
            <Link href={`/dashboard/servers/${srv.slug}`} style={{ color: "var(--pc-muted)", textDecoration: "none" }}>
              <ExternalLink size={12} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function ObservabilityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const auditQuery = useListAuditLogsV1AuditGet(
    { limit: 200 },
    { query: { refetchInterval: autoRefresh ? 30_000 : false } }
  );
  const serversQuery = useListServersV1ServersGet();

  const logs = useMemo(() => (auditQuery.data?.data ?? []) as AuditLogView[], [auditQuery.data]);
  const servers = useMemo(() => (serversQuery.data?.data ?? []) as ServerView[], [serversQuery.data]);

  const total = logs.length;
  const toolCalls = useMemo(() => logs.filter(l => l.event_type === AuditEventType.tool_call), [logs]);
  const errors = useMemo(() => logs.filter(l => l.event_type !== AuditEventType.tool_call), [logs]);
  const errorRate = total > 0 ? `${((errors.length / total) * 100).toFixed(1)}%` : "—";
  const activeServers = servers.filter(s => s.status === ServerStatus.active).length;
  const availability = servers.length > 0 ? `${((activeServers / servers.length) * 100).toFixed(0)}%` : "—";
  const activeUsers = useMemo(() => new Set(logs.map(l => l.subject_id).filter(Boolean)).size, [logs]);

  const volumeData = useMemo(() => bucket10m(logs), [logs]);

  const topTools = useMemo(() => {
    const map = new Map<string, number>();
    toolCalls.forEach(l => { if (l.tool_name) map.set(l.tool_name, (map.get(l.tool_name) ?? 0) + 1); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [toolCalls]);

  const isLoading = auditQuery.isLoading || serversQuery.isLoading;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)", margin: 0, marginBottom: 4 }}>Observability</h1>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>System health, traffic patterns, and error analysis</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/dashboard/observability/traces" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-foreground)", textDecoration: "none" }}>
            <Search size={12} /> Trace Explorer
          </Link>
          <Link href="/dashboard/observability/errors" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-foreground)", textDecoration: "none" }}>
            <AlertTriangle size={12} /> Error Analysis
          </Link>
          <button onClick={() => setAutoRefresh(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: autoRefresh ? "#2DD4A718" : "var(--pc-elevated)", border: `1px solid ${autoRefresh ? "var(--pc-primary)" : "var(--pc-border)"}`, borderRadius: 6, fontSize: 12, color: autoRefresh ? "var(--pc-primary)" : "var(--pc-muted)", cursor: "pointer", fontWeight: autoRefresh ? 600 : 400 }}>
            <Radio size={12} />{autoRefresh ? "Live" : "Paused"}
          </button>
          <button onClick={() => { auditQuery.refetch(); serversQuery.refetch(); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Metrics grid — 4 columns × 3 rows */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          {[...Array(12)].map((_, i) => <Skeleton key={i} style={{ height: 88, borderRadius: 10 }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          <MetricCard label="Request Throughput" value={total.toLocaleString()} sub={`${toolCalls.length} tool calls`} icon={<Activity size={14} />} color="var(--pc-primary)" trend="up" />
          <MetricCard label="P50 Latency" value="—" sub="not captured by API" icon={<Clock size={14} />} color="var(--pc-muted)" na />
          <MetricCard label="P95 Latency" value="—" sub="not captured by API" icon={<Clock size={14} />} color="var(--pc-muted)" na />
          <MetricCard label="P99 Latency" value="—" sub="not captured by API" icon={<Clock size={14} />} color="var(--pc-muted)" na />
          <MetricCard label="Error Rate" value={errorRate} sub={`${errors.length} errors`} icon={<XCircle size={14} />} color={errors.length > 0 ? "var(--pc-critical)" : "var(--pc-success)"} />
          <MetricCard label="Server Availability" value={availability} sub={`${activeServers}/${servers.length} active`} icon={<Server size={14} />} color="var(--pc-success)" />
          <MetricCard label="Retry Rate" value="—" sub="not captured by API" icon={<RefreshCw size={14} />} color="var(--pc-muted)" na />
          <MetricCard label="Circuit Breaker" value="—" sub="not captured by API" icon={<Zap size={14} />} color="var(--pc-muted)" na />
          <MetricCard label="Active Users" value={activeUsers} sub="unique subjects" icon={<Globe size={14} />} color="var(--pc-secondary)" />
          <MetricCard label="Blocked Requests" value={logs.filter(l => l.event_type === AuditEventType.rbac_deny).length} sub="RBAC denies" icon={<ShieldOff size={14} />} color="var(--pc-critical)" />
          <MetricCard label="Queue Depth" value="—" sub="not captured by API" icon={<TrendingUp size={14} />} color="var(--pc-muted)" na />
          <MetricCard label="Cache Hit Rate" value="—" sub="not captured by API" icon={<CheckCircle2 size={14} />} color="var(--pc-muted)" na />
        </div>
      )}

      {/* Service map */}
      <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)" }}>Service Map</div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
            Node size = request volume · Color = health status
          </div>
        </div>
        {isLoading ? <Skeleton style={{ height: 120, borderRadius: 8 }} /> : <ServiceMap servers={servers} logs={logs} />}
      </div>

      {/* Row: throughput chart + trace explorer link */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 4 }}>Request Throughput</div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 14 }}>10-minute buckets · solid = total, dashed = errors</div>
          {volumeData.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="obsTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2DD4A7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2DD4A7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#26303A" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#8B98A7" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8B98A7" }} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="total" stroke="#2DD4A7" strokeWidth={2} fill="url(#obsTotal)" name="Total" />
                <Area type="monotone" dataKey="errors" stroke="#F05D5E" strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Errors" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Trace explorer shortcut */}
        <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 12 }}>Trace Explorer</div>
          <p style={{ fontSize: 12, color: "var(--pc-muted)", lineHeight: 1.6, marginBottom: 16 }}>
            Search and inspect individual request traces. View authentication flow, policy decisions, and upstream calls for any request.
          </p>
          <Link href="/dashboard/observability/traces" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2DD4A718", border: "1px solid var(--pc-primary)", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "var(--pc-primary)", textDecoration: "none", marginBottom: 8 }}>
            <Search size={13} /> Search Traces
          </Link>
          <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{total} traces in current window</div>

          {/* Recent trace IDs */}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 5 }}>
            {logs.slice(0, 3).map(l => (
              <Link key={l.id} href={`/dashboard/observability/traces?id=${l.id}`}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--pc-bg)", borderRadius: 5, textDecoration: "none" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: l.event_type === AuditEventType.tool_call ? "var(--pc-success)" : "var(--pc-critical)", flexShrink: 0 }} />
                <code style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.id.slice(0, 20)}…</code>
                <ExternalLink size={9} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Row: Error groups + Slow tools + Unhealthy servers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 12 }}>Error Groups</div>
          <ErrorGroupsPanel logs={logs} />
        </div>

        <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 4 }}>Slow Tools</div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 14 }}>Duration not captured by API</div>
          <div style={{ padding: "10px 12px", background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 6, marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>
              Tool execution latency is not recorded in the current audit log schema. Add timing middleware to the gateway to populate this panel.
            </p>
          </div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 8 }}>Top tools by call volume (no latency):</div>
          {topTools.map(([tool, count]) => (
            <div key={tool} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pc-border)" }}>
              <code style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)" }}>{tool}</code>
              <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>{count} calls</span>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 12 }}>Unhealthy Servers</div>
          {isLoading ? <Skeleton style={{ height: 80, borderRadius: 6 }} /> : <UnhealthyServers servers={servers} />}
        </div>
      </div>

      {/* Regional performance placeholder */}
      <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 4 }}>Regional Performance</div>
        <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 16 }}>Geographic distribution is not captured by the current API</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
          {[
            { region: "us-east-1", label: "US East", status: "—" },
            { region: "us-west-2", label: "US West", status: "—" },
            { region: "eu-west-1", label: "EU West", status: "—" },
            { region: "ap-southeast-1", label: "Asia Pacific", status: "—" },
            { region: "sa-east-1", label: "South America", status: "—" },
          ].map(r => (
            <div key={r.region} style={{ padding: "12px", background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 8, textAlign: "center", opacity: 0.5 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--pc-muted)" }}>{r.status}</div>
              <div style={{ fontSize: 9, color: "var(--pc-muted)", marginTop: 3 }}>N/A</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
