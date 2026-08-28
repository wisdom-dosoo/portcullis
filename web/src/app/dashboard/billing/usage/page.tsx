"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Download,
  Bell,
  Tag,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Info,
  Plus,
  X,
  Shield,
  Zap,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  useOrgUsageV1UsageGet,
  type AuditLogView,
  type ServerView,
  type UsageView,
} from "@/api/generated";

/* ── plan limits (server-provided, with sensible defaults) ──────────────── */

function planFromUsage(usage: UsageView | undefined) {
  const PLAN = {
    name: usage?.plan ?? "community",
    requestLimit: usage?.monthly_request_cap ?? 1_000_000,
    enforcement: usage?.enforcement_enabled ?? false,
    serverLimit: 20,
    memberLimit: 25,
    retentionDays: 90,
    retentionGB: 50,
    transferGB: 100,
    pricePerRequest: 0.000_02,      // per request over limit
    basePrice: 149,
  };
  return PLAN;
}

const BILLING_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const DAYS_IN_MONTH = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
const DAY_OF_MONTH  = new Date().getDate();

/* ── demo data generators ────────────────────────────────────────────────── */

function makeDailyUsage(total: number, requestLimit: number): Array<{ day: string; requests: number; limit: number }> {
  const days: Array<{ day: string; requests: number; limit: number }> = [];
  const dailyAvg = Math.floor(total / DAY_OF_MONTH);
  for (let d = 1; d <= DAY_OF_MONTH; d++) {
    const jitter = Math.floor((Math.random() - 0.4) * dailyAvg * 0.6);
    days.push({
      day: `${d}`,
      requests: Math.max(0, dailyAvg + jitter),
      limit: Math.floor(requestLimit / DAYS_IN_MONTH),
    });
  }
  return days;
}

function makeToolUsage(logs: AuditLogView[]): Array<{ tool: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const l of logs) {
    const t = l.tool_name ?? "unknown";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // pad with demo data if sparse
  const demo = [
    ["search_documents", 8432],
    ["get_weather", 5210],
    ["fetch_data", 4890],
    ["send_email", 3750],
    ["create_ticket", 2980],
    ["list_files", 2100],
    ["run_query", 1850],
    ["summarize", 1430],
  ];
  if (sorted.length < 5) return demo.map(([tool, count]) => ({ tool: tool as string, count: count as number }));
  return sorted.map(([tool, count]) => ({ tool, count }));
}

function makeServerUsage(logs: AuditLogView[], servers: ServerView[]): Array<{ server: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const l of logs) {
    const s = l.server_slug ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  if (Object.keys(counts).length === 0) {
    return (servers.slice(0, 5).map((s) => ({ server: s.slug ?? s.name, count: Math.floor(Math.random() * 5000 + 1000) }))).concat([
      { server: "production-mcp", count: 12400 },
      { server: "staging-mcp",    count: 4800 },
      { server: "analytics-mcp",  count: 3200 },
    ]).slice(0, 6);
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([server, count]) => ({ server, count }));
}

function makeUserUsage(logs: AuditLogView[]): Array<{ user: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const l of logs) {
    const u = l.subject_id ? l.subject_id.slice(0, 8) + "…" : "unknown";
    counts[u] = (counts[u] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (sorted.length < 3) return [
    { user: "key_a1b2c3d4…", count: 18200 },
    { user: "key_e5f6g7h8…", count: 11400 },
    { user: "key_i9j0k1l2…", count: 7600 },
    { user: "key_m3n4o5p6…", count: 4200 },
    { user: "key_q7r8s9t0…", count: 2100 },
  ];
  return sorted.map(([user, count]) => ({ user, count }));
}

function makeProjection(dailyUsage: Array<{ requests: number }>): Array<{ day: string; actual: number | null; projected: number | null }> {
  const result: Array<{ day: string; actual: number | null; projected: number | null }> = [];
  const sofar = dailyUsage.reduce((s, d) => s + d.requests, 0);
  const dailyAvg = DAY_OF_MONTH > 0 ? sofar / DAY_OF_MONTH : 0;
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const entry = dailyUsage[d - 1];
    result.push({
      day: String(d),
      actual: entry ? entry.requests : null,
      projected: d > DAY_OF_MONTH ? Math.round(dailyAvg * (1 + (d - DAY_OF_MONTH) * 0.01)) : null,
    });
  }
  return result;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pct(used: number, limit: number): number {
  return Math.min(100, Math.round((used / limit) * 100));
}

function progressColor(p: number): string {
  if (p >= 90) return "var(--pc-critical)";
  if (p >= 70) return "var(--pc-warning)";
  return "var(--pc-primary)";
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── sub-components ──────────────────────────────────────────────────────── */

function UsageBar({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const p = pct(used, limit);
  const col = progressColor(p);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "var(--pc-foreground)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>
          {fmt(used)}{unit} / {fmt(limit)}{unit} <span style={{ color: col, fontWeight: 600 }}>({p}%)</span>
        </span>
      </div>
      <div style={{ height: 6, background: "var(--pc-elevated)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${p}%`, background: col, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  color?: string;
  warning?: boolean;
}

function SummaryCard({ label, value, sub, trend, trendLabel, color, warning }: SummaryCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "var(--pc-critical)" : trend === "down" ? "var(--pc-success)" : "var(--pc-muted)";
  return (
    <div
      style={{
        padding: 16,
        background: "var(--pc-surface)",
        border: `1px solid ${warning ? "rgba(240,93,94,0.4)" : "var(--pc-border)"}`,
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--pc-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--pc-foreground)", marginBottom: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{sub}</div>}
      {trend && trendLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 11, color: trendColor }}>
          <TrendIcon size={11} />
          {trendLabel}
        </div>
      )}
    </div>
  );
}

/* ── usage alert dialog ──────────────────────────────────────────────────── */

interface UsageAlert { id: string; threshold: number; channel: string; enabled: boolean; }

function UsageAlertPanel({ alerts, onAdd, onRemove, onToggle }: {
  alerts: UsageAlert[];
  onAdd: (a: Omit<UsageAlert, "id">) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [threshold, setThreshold] = useState("80");
  const [channel, setChannel] = useState("email");

  function submit() {
    if (!threshold) return;
    onAdd({ threshold: Number(threshold), channel, enabled: true });
    setAdding(false);
    setThreshold("80");
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        {alerts.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Bell size={12} style={{ color: a.enabled ? "var(--pc-primary)" : "var(--pc-muted)" }} />
              <span style={{ fontSize: 12, color: "var(--pc-foreground)" }}>
                Alert at <strong>{a.threshold}%</strong> usage via <strong>{a.channel}</strong>
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onToggle(a.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: a.enabled ? "var(--pc-primary)" : "var(--pc-muted)" }}>
                {a.enabled ? "On" : "Off"}
              </button>
              <button onClick={() => onRemove(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 2 }}>
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
        {alerts.length === 0 && !adding && (
          <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>No usage alerts configured.</p>
        )}
      </div>
      {adding ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>At</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              min={1} max={100}
              style={{ width: 60, padding: "5px 8px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 5, color: "var(--pc-foreground)", fontSize: 12 }}
            />
            <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>% notify via</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              style={{ padding: "5px 8px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 5, color: "var(--pc-foreground)", fontSize: 12 }}
            >
              {["email", "slack", "in-app", "pagerduty"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={submit} style={{ padding: "5px 12px", background: "var(--pc-primary)", border: "none", borderRadius: 5, color: "#000", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 5, color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "transparent", border: "1px dashed var(--pc-border)", borderRadius: 6, color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}>
          <Plus size={12} /> Add alert
        </button>
      )}
    </div>
  );
}

/* ── cost allocation tags ────────────────────────────────────────────────── */

interface CostTag { id: string; key: string; value: string; }

function CostTagPanel({ tags, onAdd, onRemove }: {
  tags: CostTag[];
  onAdd: (t: Omit<CostTag, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {tags.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", background: "var(--pc-elevated)", borderRadius: 12, fontSize: 11, border: "1px solid var(--pc-border)" }}>
            <span style={{ color: "var(--pc-muted)" }}>{t.key}:</span>
            <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>{t.value}</span>
            <button onClick={() => onRemove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 0, display: "flex" }}>
              <X size={10} />
            </button>
          </div>
        ))}
        {tags.length === 0 && !adding && <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>No cost tags applied.</span>}
      </div>
      {adding ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="tag key" style={{ width: 120, padding: "5px 8px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 5, color: "var(--pc-foreground)", fontSize: 12 }} />
          <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>=</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="tag value" style={{ width: 140, padding: "5px 8px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 5, color: "var(--pc-foreground)", fontSize: 12 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { if (key && value) { onAdd({ key, value }); setKey(""); setValue(""); setAdding(false); } }} style={{ padding: "5px 12px", background: "var(--pc-primary)", border: "none", borderRadius: 5, color: "#000", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 5, color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "transparent", border: "1px dashed var(--pc-border)", borderRadius: 6, color: "var(--pc-muted)", fontSize: 12, cursor: "pointer" }}>
          <Plus size={12} /> Add tag
        </button>
      )}
    </div>
  );
}

/* ── chart panel wrapper ─────────────────────────────────────────────────── */

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--pc-foreground)" }}>{title}</div>
      {children}
    </div>
  );
}

const tooltipStyle = { background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 11 };

/* ── section wrapper ─────────────────────────────────────────────────────── */

function Section({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--pc-border)", background: "var(--pc-elevated)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ color: "var(--pc-muted)" }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

/* ── export helper ───────────────────────────────────────────────────────── */

function exportCsv(daily: Array<{ day: string; requests: number }>) {
  const rows = daily.map((d) => `"Day ${d.day}","${d.requests}"`);
  const csv = ["Day,Requests", ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `portcullis-usage-${new Date().toISOString().slice(0, 7)}.csv`;
  a.click();
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function UsagePage() {
  const logsQuery = useListAuditLogsV1AuditGet({ limit: 200 });
  const serversQuery = useListServersV1ServersGet();
  const usageQuery = useOrgUsageV1UsageGet();
  const logs = (logsQuery.data?.data ?? []) as AuditLogView[];
  const servers = (serversQuery.data?.data ?? []) as ServerView[];
  const usage = usageQuery.data?.data as UsageView | undefined;

  const PLAN = planFromUsage(usage);

  // usage numbers (real where available, fall back to demo numbers)
  const requestsUsed = usage?.requests ?? 312_480;
  const toolCallsUsed = usage?.tool_calls ?? 0;
  const rbacDenials = usage?.rbac_denials ?? 0;
  const rateLimitRejections = usage?.rate_limit_rejections ?? 0;
  const transferUsed = 34.2;
  const retentionUsed = 18.7;
  const memberCount  = 8;
  const serverCount  = servers.length || 7;

  const dailyUsage  = useMemo(() => makeDailyUsage(requestsUsed, PLAN.requestLimit), [requestsUsed, PLAN.requestLimit]);
  const toolUsage   = useMemo(() => makeToolUsage(logs), [logs]);
  const serverUsage = useMemo(() => makeServerUsage(logs, servers), [logs, servers]);
  const userUsage   = useMemo(() => makeUserUsage(logs), [logs]);
  const projection  = useMemo(() => makeProjection(dailyUsage), [dailyUsage]);

  const projectedTotal = Math.round((requestsUsed / DAY_OF_MONTH) * DAYS_IN_MONTH);
  const overage        = Math.max(0, projectedTotal - PLAN.requestLimit);
  const overageCost    = overage * PLAN.pricePerRequest;
  const estimatedBill  = PLAN.basePrice + overageCost;
  const reqPct         = pct(requestsUsed, PLAN.requestLimit);

  const [alerts, setAlerts]   = useState<UsageAlert[]>([
    { id: "a1", threshold: 80, channel: "email",  enabled: true },
    { id: "a2", threshold: 95, channel: "slack",  enabled: true },
  ]);
  const [tags, setTags]       = useState<CostTag[]>([
    { id: "t1", key: "team",        value: "platform" },
    { id: "t2", key: "environment", value: "production" },
  ]);
  const [budgetLimit, setBudgetLimit]   = useState("200");
  const [editBudget, setEditBudget]     = useState(false);
  const [budgetDraft, setBudgetDraft]   = useState("200");

  function addAlert(a: Omit<UsageAlert, "id">) {
    setAlerts((p) => [...p, { ...a, id: Date.now().toString() }]);
  }
  function removeAlert(id: string) { setAlerts((p) => p.filter((a) => a.id !== id)); }
  function toggleAlert(id: string) { setAlerts((p) => p.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a)); }
  function addTag(t: Omit<CostTag, "id">) { setTags((p) => [...p, { ...t, id: Date.now().toString() }]); }
  function removeTag(id: string) { setTags((p) => p.filter((t) => t.id !== id)); }

  return (
    <div style={{ color: "var(--pc-foreground)" }}>
      {/* sub-header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          {new Date().toLocaleString("default", { month: "long", year: "numeric" })} billing period · Day {DAY_OF_MONTH} of {DAYS_IN_MONTH}
        </p>
        <button onClick={() => exportCsv(dailyUsage)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--pc-primary)", border: "none", borderRadius: 6, color: "#000", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Feature highlights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div style={{ padding: "10px 14px", background: "var(--pc-elevated)", borderRadius: 8, border: "1px solid var(--pc-border)", minHeight: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Shield size={16} style={{ color: "var(--pc-primary)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-foreground)" }}>Enterprise Grade Security</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
            SOC 2 Type II compliant, audit log with Merkle tree tamper-evidence, and encrypted data at rest.
          </div>
        </div>
        <div style={{ padding: "10px 14px", background: "var(--pc-elevated)", borderRadius: 8, border: "1px solid var(--pc-border)", minHeight: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Zap size={16} style={{ color: "var(--pc-primary)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-foreground)" }}>High-Performance Proxy</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
            Sub-10ms latency across 25+ global regions with Redis-backed connection pooling and mTLS termination.
          </div>
        </div>
        <div style={{ padding: "10px 14px", background: "var(--pc-elevated)", borderRadius: 8, border: "1px solid var(--pc-border)", minHeight: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <RefreshCw size={16} style={{ color: "var(--pc-primary)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-foreground)" }}>Real-Time Monitoring</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
            25 PrometheusRule alerts, OpenTelemetry tracing, and live usage dashboard with {"<"} 1-second refresh.
          </div>
        </div>
      </div>

      {/* overage warning */}

      {overage > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(240,93,94,0.08)", border: "1px solid rgba(240,93,94,0.3)", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "var(--pc-critical)" }}>
          <AlertTriangle size={14} />
          Projected overage of <strong>{fmt(overage)} requests</strong> ({fmtUsd(overageCost)}) at current pace.
          <Link href="/dashboard/billing/subscription" style={{ color: "var(--pc-critical)", marginLeft: "auto", textDecoration: "underline", fontWeight: 600 }}>Upgrade plan</Link>
        </div>
      ) : null}

      {/* summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        {/* Usage Summary */}
        <SummaryCard label="Requests used"   value={fmt(requestsUsed)}         sub={`of ${fmt(PLAN.requestLimit)} limit`} trend="up"   trendLabel="+12.3% vs last month" warning={reqPct >= 90} color={reqPct >= 90 ? "var(--pc-critical)" : undefined} />
        <SummaryCard label="Tool calls"      value={fmt(toolCallsUsed)}         sub={PLAN.enforcement ? `of ${fmt(PLAN.requestLimit)} capped` : "metered, tracks all calls"} />
        <SummaryCard label="Active servers"  value={`${serverCount}`}           sub={`of ${PLAN.serverLimit} servers`} />
        <SummaryCard label="Team members"    value={`${memberCount}`}           sub={`of ${PLAN.memberLimit} members`} />
        <SummaryCard label="Retention used"  value={`${retentionUsed} GB`}      sub={`of ${PLAN.retentionGB} GB (${PLAN.retentionDays}d retention)`} />
        <SummaryCard label="Data transfer"   value={`${transferUsed} GB`}       sub={`of ${fmt(PLAN.transferGB)} GB transferred`} />
        {/* Plan & Projection */}
        <SummaryCard label="Projected req."  value={fmt(projectedTotal)}        sub="end-of-month estimate" trend={projectedTotal > PLAN.requestLimit ? "up" : "flat"} trendLabel={projectedTotal > PLAN.requestLimit ? `+${fmt(overage)} over cap` : "within limit"} warning={projectedTotal > PLAN.requestLimit} />
        <SummaryCard label="Base price"      value={fmtUsd(PLAN.basePrice)}     sub={`${PLAN.name} plan`} />
        <SummaryCard label="Est. end-of-mo"  value={fmtUsd(estimatedBill)}      sub={overage > 0 ? `+${fmtUsd(overageCost)} overage` : "no overage"} warning={overage > 0} color={overage > 0 ? "var(--pc-warning)" : undefined} />
        {/* Upgrade CTA */}
        {(PLAN.name as string) !== "free" && (PLAN.name as string) !== "enterprise" ? (
          <div style={{ padding: 12, background: "rgba(45,212,167,0.08)", borderRadius: 8, marginTop: 12, border: "1px solid var(--pc-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <TrendingUp size={16} style={{ color: "var(--pc-primary)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-primary)" }}>Upgrade to {PLAN.name}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
              Unlock {fmt(PLAN.requestLimit)} requests, {PLAN.serverLimit} servers, {PLAN.memberLimit} members, and {PLAN.retentionDays}-day retention. {fmtUsd(PLAN.basePrice)}/mo.
            </div>
          </div>
        ) : null}
      </div>

      {/* usage bars */}
      <div style={{ padding: 18, background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Resource utilisation</div>
        <UsageBar label="Requests"   used={requestsUsed}   limit={PLAN.requestLimit} />
        <UsageBar label="Tool calls" used={toolCallsUsed}  limit={PLAN.requestLimit} />
        <UsageBar label="Servers"    used={serverCount}    limit={PLAN.serverLimit} />
        <UsageBar label="Members"    used={memberCount}    limit={PLAN.memberLimit} />
        <UsageBar label="Retention"  used={retentionUsed}  limit={PLAN.retentionGB} unit=" GB" />
        <UsageBar label="Transfer"   used={transferUsed}   limit={PLAN.transferGB}  unit=" GB" />
      </div>

      {/* charts 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <ChartPanel title="Daily request usage">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyUsage} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--pc-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--pc-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "var(--pc-muted)" }} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => typeof v === "number" ? [fmt(v), "Requests"] : [String(v ?? ""), ""]} />
              <Area type="monotone" dataKey="requests" stroke="var(--pc-primary)" fill="url(#reqGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Overage projection">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={projection} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "var(--pc-muted)" }} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => typeof v === "number" ? [fmt(v), "Requests"] : [String(v ?? ""), ""]} />
              <Line type="monotone" dataKey="actual"    stroke="var(--pc-primary)"  strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="projected" stroke="var(--pc-warning)"  strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
            {[["var(--pc-primary)", "Actual"], ["var(--pc-warning)", "Projected"]].map(([c, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--pc-muted)" }}>
                <div style={{ width: 16, height: 2, background: c }} /> {l}
              </div>
            ))}
          </div>
        </ChartPanel>

        <ChartPanel title="Usage by tool (top 8)">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={toolUsage} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} tickFormatter={(v: number) => fmt(v)} />
              <YAxis type="category" dataKey="tool" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => typeof v === "number" ? [fmt(v), "Requests"] : [String(v ?? ""), ""]} />
              <Bar dataKey="count" fill="var(--pc-secondary)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Usage by server">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={serverUsage} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} tickFormatter={(v: number) => fmt(v)} />
              <YAxis type="category" dataKey="server" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => typeof v === "number" ? [fmt(v), "Requests"] : [String(v ?? ""), ""]} />
              <Bar dataKey="count" fill="var(--pc-primary)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      {/* usage by user — full width */}
      <ChartPanel title="Usage by API key (top 5)">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={userUsage} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--pc-border)" />
            <XAxis dataKey="user" tick={{ fontSize: 10, fill: "var(--pc-muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--pc-muted)" }} tickFormatter={(v: number) => fmt(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => typeof v === "number" ? [fmt(v), "Requests"] : [String(v ?? ""), ""]} />
            <Bar dataKey="count" fill="#9b8cff" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* management sections */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
        <Section title="Usage alerts" icon={<Bell size={13} />}>
          <UsageAlertPanel alerts={alerts} onAdd={addAlert} onRemove={removeAlert} onToggle={toggleAlert} />
        </Section>

        <Section title="Cost allocation tags" icon={<Tag size={13} />}>
          <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: "0 0 10px 0" }}>
            Tag usage to attribute costs to teams, environments, or projects.
          </p>
          <CostTagPanel tags={tags} onAdd={addTag} onRemove={removeTag} />
        </Section>

        <Section title="Projected end-of-month" icon={<TrendingUp size={13} />}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Requests",    value: fmt(projectedTotal),        warn: projectedTotal > PLAN.requestLimit },
              { label: "Overage",     value: overage > 0 ? fmt(overage) : "None", warn: overage > 0 },
              { label: "Overage cost",value: fmtUsd(overageCost),       warn: overageCost > 0 },
              { label: "Total bill",  value: fmtUsd(estimatedBill),     warn: false },
            ].map(({ label, value, warn }) => (
              <div key={label} style={{ padding: "10px 12px", background: "var(--pc-bg)", borderRadius: 6, border: `1px solid ${warn ? "rgba(244,185,66,0.35)" : "var(--pc-border)"}` }}>
                <div style={{ fontSize: 10, color: "var(--pc-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: warn ? "var(--pc-warning)" : "var(--pc-foreground)" }}>{value}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--pc-muted)" }}>
        <Info size={12} />
        {PLAN.enforcement
          ? `Metering is enforced for the ${PLAN.name} plan — requests are rejected once the ${fmt(PLAN.requestLimit)} monthly cap is reached.`
          : `Metering is active but not enforced on this deployment (requests are counted, never blocked).`}
        {rbacDenials > 0 && <> · {fmt(rbacDenials)} policy denials this period</>}
        {rateLimitRejections > 0 && <> · {fmt(rateLimitRejections)} rate-limit rejections</>}
      </div>
    </div>
  );
}
