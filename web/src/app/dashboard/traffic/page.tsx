"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  ShieldOff,
  AlertTriangle,
  Users,
  Zap,
  RefreshCw,
  Clock,
  Server,
  Wrench,
  TrendingUp,
  TrendingDown,
  Radio,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  type AuditLogView,
  AuditEventType,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
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

function bucketByMinutes(
  logs: AuditLogView[],
  bucketMins: number
): { time: string; total: number; errors: number; blocked: number }[] {
  if (logs.length === 0) return [];
  const ms = bucketMins * 60_000;
  const buckets = new Map<number, { total: number; errors: number; blocked: number }>();
  logs.forEach(l => {
    const t = Math.floor(new Date(l.created_at).getTime() / ms) * ms;
    const b = buckets.get(t) ?? { total: 0, errors: 0, blocked: 0 };
    b.total++;
    if (l.event_type === AuditEventType.auth_failure) b.errors++;
    if (l.event_type === AuditEventType.rbac_deny) b.blocked++;
    buckets.set(t, b);
  });
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, v]) => ({ time: fmtTime(new Date(ts).toISOString()), ...v }));
}

function topNByField(logs: AuditLogView[], field: keyof AuditLogView, n = 8): { label: string; count: number }[] {
  const map = new Map<string, number>();
  logs.forEach(l => {
    const val = l[field] as string | null;
    if (val) map.set(val, (map.get(val) ?? 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, count]) => ({ label, count }));
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#1B232C", border: "1px solid #26303A", borderRadius: 6, fontSize: 11, color: "#F1F5F9",
};

/* ── sub-components ──────────────────────────────────────────────────────── */

function SummaryCard({ label, value, sub, icon, color, trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; trend?: "up" | "down";
}) {
  return (
    <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
        {trend === "up" && <TrendingUp size={13} style={{ color: "var(--pc-success)" }} />}
        {trend === "down" && <TrendingDown size={13} style={{ color: "var(--pc-critical)" }} />}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--pc-foreground)", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: note ? 4 : 16 }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 14 }}>{note}</div>}
      {children}
    </div>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    tool_call: { label: "Tool Call", color: "var(--pc-success)" },
    rbac_deny: { label: "RBAC Deny", color: "var(--pc-critical)" },
    auth_failure: { label: "Auth Fail", color: "var(--pc-warning)" },
  };
  const { label, color } = map[type] ?? { label: type, color: "var(--pc-muted)" };
  return <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` }}>{label}</span>;
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function TrafficPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [serverFilter, setServerFilter] = useState<string | null>(null);
  const [bucketMins, setBucketMins] = useState(10);

  const auditQuery = useListAuditLogsV1AuditGet(
    serverFilter ? { limit: 200, server_slug: serverFilter } : { limit: 200 },
    { query: { refetchInterval: autoRefresh ? 30_000 : false } }
  );
  const serversQuery = useListServersV1ServersGet();

  const logs = useMemo(() => (auditQuery.data?.data ?? []) as AuditLogView[], [auditQuery.data]);
  const servers = useMemo(() => (serversQuery.data?.data ?? []) as Array<{ slug: string; name: string }>, [serversQuery.data]);

  const total = logs.length;
  const toolCalls = useMemo(() => logs.filter(l => l.event_type === AuditEventType.tool_call), [logs]);
  const authFails = useMemo(() => logs.filter(l => l.event_type === AuditEventType.auth_failure), [logs]);
  const rbacDenies = useMemo(() => logs.filter(l => l.event_type === AuditEventType.rbac_deny), [logs]);
  const allowed = useMemo(() => logs.filter(l => l.outcome === "allowed" || l.outcome === "success"), [logs]);
  const successRate = total > 0 ? ((allowed.length / total) * 100).toFixed(1) : "—";
  const errorRate = total > 0 ? (((authFails.length + rbacDenies.length) / total) * 100).toFixed(1) : "—";
  const activeUsers = useMemo(() => new Set(logs.map(l => l.subject_id).filter(Boolean)).size, [logs]);

  const volumeData = useMemo(() => bucketByMinutes(logs, bucketMins), [logs, bucketMins]);
  const byServer = useMemo(() => topNByField(logs, "server_slug"), [logs]);
  const byTool = useMemo(() => topNByField(logs, "tool_name"), [logs]);
  const byUser = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => {
      if (l.subject_id) {
        const key = l.subject_id.slice(0, 10) + "…";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
  }, [logs]);

  const byEventType = useMemo(() => [
    { label: "Tool Call", count: toolCalls.length, color: "var(--pc-success)" },
    { label: "RBAC Deny", count: rbacDenies.length, color: "var(--pc-critical)" },
    { label: "Auth Fail", count: authFails.length, color: "var(--pc-warning)" },
  ], [toolCalls, rbacDenies, authFails]);

  const isLoading = auditQuery.isLoading;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)", margin: 0, marginBottom: 4 }}>Traffic Overview</h1>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>Last {total} events · up to 200 per query</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={serverFilter ?? ""} onChange={e => setServerFilter(e.target.value || null)}
            style={{ padding: "7px 10px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-foreground)", cursor: "pointer", outline: "none" }}>
            <option value="">All Servers</option>
            {servers.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
          <select value={bucketMins} onChange={e => setBucketMins(Number(e.target.value))}
            style={{ padding: "7px 10px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-foreground)", cursor: "pointer", outline: "none" }}>
            <option value={1}>1m buckets</option>
            <option value={5}>5m buckets</option>
            <option value={10}>10m buckets</option>
            <option value={30}>30m buckets</option>
            <option value={60}>1h buckets</option>
          </select>
          <button onClick={() => setAutoRefresh(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: autoRefresh ? "#2DD4A718" : "var(--pc-elevated)", border: `1px solid ${autoRefresh ? "var(--pc-primary)" : "var(--pc-border)"}`, borderRadius: 6, fontSize: 12, color: autoRefresh ? "var(--pc-primary)" : "var(--pc-muted)", cursor: "pointer", fontWeight: autoRefresh ? 600 : 400 }}>
            <Radio size={12} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button onClick={() => auditQuery.refetch()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          {[...Array(8)].map((_, i) => <Skeleton key={i} style={{ height: 100, borderRadius: 10 }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Total Requests" value={total.toLocaleString()} sub="in current dataset" icon={<Activity size={16} />} color="var(--pc-primary)" trend="up" />
          <SummaryCard label="Success Rate" value={successRate === "—" ? "—" : `${successRate}%`} sub="allowed outcomes" icon={<CheckCircle2 size={16} />} color="var(--pc-success)" />
          <SummaryCard label="Error Rate" value={errorRate === "—" ? "—" : `${errorRate}%`} sub="auth failures + denies" icon={<XCircle size={16} />} color="var(--pc-critical)" />
          <SummaryCard label="P95 Latency" value="—" sub="not captured by API" icon={<Clock size={16} />} color="var(--pc-muted)" />
          <SummaryCard label="Blocked (RBAC)" value={rbacDenies.length.toLocaleString()} sub={`${total > 0 ? ((rbacDenies.length / total) * 100).toFixed(1) : 0}% of traffic`} icon={<ShieldOff size={16} />} color="var(--pc-critical)" />
          <SummaryCard label="Auth Failures" value={authFails.length.toLocaleString()} sub="invalid credentials" icon={<AlertTriangle size={16} />} color="var(--pc-warning)" />
          <SummaryCard label="Active Users" value={activeUsers} sub="unique subjects" icon={<Users size={16} />} color="var(--pc-secondary)" />
          <SummaryCard label="Data Transferred" value="—" sub="not captured by API" icon={<Zap size={16} />} color="var(--pc-muted)" />
        </div>
      )}

      {/* Row 1: Volume + Event type breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Request Volume" note={`${bucketMins}-minute buckets`}>
          {volumeData.length === 0 ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2DD4A7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2DD4A7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#26303A" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#8B98A7" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8B98A7" }} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="total" stroke="#2DD4A7" strokeWidth={2} fill="url(#gTotal)" name="Total" />
                <Area type="monotone" dataKey="errors" stroke="#F4B942" strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Auth Fail" />
                <Area type="monotone" dataKey="blocked" stroke="#F05D5E" strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Blocked" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="By Event Type">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
            {byEventType.map(item => (
              <div key={item.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>{item.count}</span>
                </div>
                <div style={{ height: 6, background: "var(--pc-border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: total > 0 ? `${(item.count / total) * 100}%` : "0%", background: item.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Row 2: By server + by tool */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Traffic by Server">
          {byServer.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}><Server size={18} style={{ marginRight: 8 }} />No server data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byServer} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#8B98A7" }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#8B98A7" }} width={90} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#48B8E8" radius={[0, 3, 3, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Traffic by Tool">
          {byTool.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}><Wrench size={18} style={{ marginRight: 8 }} />No tool data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byTool} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#8B98A7" }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#8B98A7" }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#2DD4A7" radius={[0, 3, 3, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 3: By user + error rate line */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <ChartCard title="Traffic by Identity">
          {byUser.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}><Users size={18} style={{ marginRight: 8 }} />No identity data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byUser} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#8B98A7" }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#8B98A7" }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#A78BFA" radius={[0, 3, 3, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Error Rate Over Time" note="Auth failures + RBAC denies per bucket">
          {volumeData.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-muted)", fontSize: 12 }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={volumeData.map(d => ({ ...d, rate: d.total > 0 ? Math.round(((d.errors + d.blocked) / d.total) * 100) : 0 }))}>
                <CartesianGrid stroke="#26303A" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#8B98A7" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8B98A7" }} unit="%" width={32} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => typeof v === "number" ? [`${v}%`, "Error %"] : [String(v ?? ""), ""]} />
                <Line type="monotone" dataKey="rate" stroke="#F4B942" strokeWidth={2} dot={false} name="Error %" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Live feed */}
      <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--pc-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: autoRefresh ? "var(--pc-success)" : "var(--pc-muted)", boxShadow: autoRefresh ? "0 0 0 3px #35C88A30" : "none" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)" }}>Live Request Feed</span>
            {auditQuery.isFetching && <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>Refreshing…</span>}
          </div>
          <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>Showing {Math.min(logs.length, 50)} of {total}</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 16 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} style={{ height: 36, borderRadius: 6, marginBottom: 6 }} />)}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--pc-muted)", fontSize: 13 }}>
            No requests yet. Traffic will appear here as MCP tools are called.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
                  {["Time", "Identity", "Tool", "Server", "Event", "Result", "Duration", "Policy"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 50).map((log, i) => (
                  <tr key={log.id}
                    style={{ borderBottom: i < Math.min(logs.length, 50) - 1 ? "1px solid var(--pc-border)" : "none" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1B232C")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "var(--pc-muted)", whiteSpace: "nowrap", fontFamily: "monospace" }}>{relativeTime(log.created_at)}</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--pc-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject_id ? `${log.subject_id.slice(0, 10)}…` : "—"}</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.tool_name ?? log.rpc_method ?? "—"}</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--pc-secondary)", whiteSpace: "nowrap" }}>{log.server_slug ?? "—"}</td>
                    <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}><EventTypeBadge type={log.event_type} /></td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: log.outcome === "allowed" || log.outcome === "success" ? "var(--pc-success)" : "var(--pc-critical)", whiteSpace: "nowrap" }}>{log.outcome}</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "var(--pc-muted)" }}>—</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: log.event_type === AuditEventType.rbac_deny ? "var(--pc-critical)" : log.event_type === AuditEventType.auth_failure ? "var(--pc-warning)" : "var(--pc-success)", whiteSpace: "nowrap" }}>
                      {log.event_type === AuditEventType.tool_call ? "✓ allowed" : log.event_type === AuditEventType.rbac_deny ? "✗ rbac deny" : "✗ auth fail"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
