"use client";

import Link from "next/link";
import {
  useListServersV1ServersGet,
  useListApiKeysV1ApiKeysGet,
  useListAuditLogsV1AuditGet,
  useListPoliciesV1RateLimitPoliciesGet,
  type AuditLogView,
  type ServerView,
} from "@/api/generated";
import {
  Server,
  Key,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  ArrowRight,
  Activity,
  Sparkles,
  Plus,
  ShieldAlert,
  Users,
  Wrench,
  CircleCheck,
} from "lucide-react";
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

/* ── helpers ─────────────────────────────────────────────────────── */

function outcomeConfig(outcome: string) {
  if (outcome === "allowed") return { icon: CheckCircle2, color: "#35C88A", bg: "rgba(53,200,138,0.12)", label: "allowed" };
  if (outcome === "denied")  return { icon: XCircle,      color: "#F05D5E", bg: "rgba(240,93,94,0.12)",  label: "denied"  };
  return                            { icon: AlertTriangle, color: "#F4B942", bg: "rgba(244,185,66,0.12)", label: "other"   };
}

function statusConfig(status: string) {
  if (status === "active")    return { color: "#2DD4A7", bg: "rgba(45,212,167,0.12)" };
  if (status === "unhealthy") return { color: "#F05D5E", bg: "rgba(240,93,94,0.12)" };
  return                             { color: "#8B98A7", bg: "rgba(139,152,167,0.1)" };
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  loading: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className="rounded-2xl border p-5 group transition-colors hover:border-opacity-60"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--pc-muted)" }}>
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-8 w-16 mt-2" style={{ background: "var(--pc-elevated)" }} />
          ) : (
            <p className="text-3xl font-bold mt-1 tabular-nums" style={{ color: "var(--pc-foreground)" }}>
              {value}
            </p>
          )}
          {sub && <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>{sub}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
      </div>
      {href && (
        <div className="flex items-center gap-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--pc-primary)" }}>
          View all <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/* ── mock chart data ─────────────────────────────────────────────── */
function mockChartData() {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => ({
    hour: new Date(now - (23 - i) * 3_600_000).getHours() + ":00",
    allowed: Math.floor(Math.random() * 80 + 20),
    denied:  Math.floor(Math.random() * 10),
  }));
}
const CHART_DATA = mockChartData();

/* ── quick action button ─────────────────────────────────────────── */
function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors"
      style={{
        background: "var(--pc-elevated)",
        borderColor: "var(--pc-border)",
        color: "var(--pc-muted)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = "var(--pc-primary)";
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(45,212,167,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.color = "var(--pc-muted)";
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--pc-border)";
      }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
      {label}
    </Link>
  );
}

/* ── component ───────────────────────────────────────────────────── */

function DemoBanner() {
  return (
    <div className="mb-4 rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2" style={{ background: "rgba(244,185,66,0.10)", borderColor: "rgba(244,185,66,0.35)", color: "#F4B942" }}>
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
      <span className="font-semibold">Demo data</span>
      <span style={{ color: "var(--pc-muted)" }}>— traffic charts and billing widgets are mocked until backend APIs land. Servers, roles, and audit are live.</span>
    </div>
  );
}

export default function DashboardPage() {
  const { data: serversResp, isLoading: loadingServers } = useListServersV1ServersGet();
  const { data: keysResp,    isLoading: loadingKeys    } = useListApiKeysV1ApiKeysGet();
  const { data: auditResp,   isLoading: loadingAudit   } = useListAuditLogsV1AuditGet({ limit: 50 });
  const { data: rlResp,      isLoading: loadingRl      } = useListPoliciesV1RateLimitPoliciesGet();

  const servers = (Array.isArray(serversResp?.data) ? serversResp.data : []) as ServerView[];
  const keys    = Array.isArray(keysResp?.data)    ? keysResp.data    : [];
  const audit   = (Array.isArray(auditResp?.data)  ? auditResp.data   : []) as AuditLogView[];
  const rl      = Array.isArray(rlResp?.data)      ? rlResp.data      : [];

  const allowed       = audit.filter((a) => a.outcome === "allowed").length;
  const denied        = audit.filter((a) => a.outcome === "denied").length;
  const recentAudit   = audit.slice(0, 8);
  const unhealthySvrs = servers.filter((s) => s.status !== "active");
  const deniedEvents  = audit.filter((a) => a.outcome === "denied").slice(0, 5);
  const toolCount     = audit.filter((a) => a.event_type === "tool_call").length;
  const activeToday   = new Set(audit.map((a) => a.subject_id).filter(Boolean)).size;

  const checklist = [
    { label: "Register first MCP server",  done: servers.length > 0,  href: "/dashboard/servers/new"  },
    { label: "Create API key",             done: keys.length > 0,     href: "/dashboard/api-keys"     },
    { label: "Set up rate limit policy",   done: rl.length > 0,       href: "/dashboard/rate-limits"  },
    { label: "Test a tool via playground", done: false,               href: "/dashboard/playground"   },
  ];

  return (
    <div className="space-y-8">
      <DemoBanner />
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>
            Overview
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Gateway health and recent activity
          </p>
        </div>
        {/* Quick actions bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <QuickAction href="/dashboard/servers/new"  icon={Plus}        label="Add Server"     />
          <QuickAction href="/dashboard/api-keys"     icon={Key}         label="Create API Key" />
          <QuickAction href="/dashboard/rate-limits"  icon={Zap}         label="Add Policy"     />
          <QuickAction href="/dashboard/audit"        icon={Activity}    label="View Logs"      />
        </div>
      </div>

      {/* Onboarding banner — shown when no servers registered */}
      {!loadingServers && servers.length === 0 && (
        <div
          className="rounded-2xl border px-6 py-5 flex items-center gap-5"
          style={{ background: "rgba(45,212,167,0.06)", borderColor: "rgba(45,212,167,0.2)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(45,212,167,0.12)" }}>
            <Sparkles className="w-5 h-5" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>Complete your setup</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
              No MCP servers registered yet. Follow the setup guide to connect your first server, create a policy, and generate an API key.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            Start setup <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          </Link>
        </div>
      )}

      {/* Stat cards — 2 rows */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Row 1 */}
        <StatCard
          label="MCP Servers"
          value={servers.length}
          sub={`${servers.filter((s) => s.status === "active").length} active`}
          icon={Server}
          iconColor="#48B8E8"
          iconBg="rgba(72,184,232,0.15)"
          loading={loadingServers}
          href="/dashboard/servers"
        />
        <StatCard
          label="API Keys"
          value={keys.length}
          icon={Key}
          iconColor="#2DD4A7"
          iconBg="rgba(45,212,167,0.15)"
          loading={loadingKeys}
          href="/dashboard/api-keys"
        />
        <StatCard
          label="Requests Allowed"
          value={allowed}
          sub="recent window"
          icon={CheckCircle2}
          iconColor="#35C88A"
          iconBg="rgba(53,200,138,0.15)"
          loading={loadingAudit}
        />
        <StatCard
          label="Rate Limit Policies"
          value={rl.length}
          icon={Zap}
          iconColor="#F4B942"
          iconBg="rgba(244,185,66,0.15)"
          loading={loadingRl}
          href="/dashboard/rate-limits"
        />
        {/* Row 2 */}
        <StatCard
          label="Blocked Requests"
          value={denied}
          sub="recent window"
          icon={ShieldAlert}
          iconColor="#F05D5E"
          iconBg="rgba(240,93,94,0.15)"
          loading={loadingAudit}
          href="/dashboard/audit"
        />
        <StatCard
          label="Unhealthy Servers"
          value={unhealthySvrs.length}
          icon={AlertTriangle}
          iconColor="#F4B942"
          iconBg="rgba(244,185,66,0.15)"
          loading={loadingServers}
          href="/dashboard/servers"
        />
        <StatCard
          label="Tools Available"
          value={toolCount}
          sub="from audit events"
          icon={Wrench}
          iconColor="#48B8E8"
          iconBg="rgba(72,184,232,0.15)"
          loading={loadingAudit}
        />
        <StatCard
          label="Active Today"
          value={activeToday}
          sub="unique subjects"
          icon={Users}
          iconColor="#2DD4A7"
          iconBg="rgba(45,212,167,0.15)"
          loading={loadingAudit}
        />
      </div>

      {/* Chart */}
      <div
        className="rounded-2xl border p-6"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
              Request Traffic
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>Last 24 hours (simulated)</p>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--pc-muted)" }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#2DD4A7" }} />
              Allowed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#F05D5E" }} />
              Denied
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={CHART_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gAllowed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2DD4A7" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2DD4A7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gDenied" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#F05D5E" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F05D5E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#26303A" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fill: "#8B98A7", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fill: "#8B98A7", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#1B232C",
                border: "1px solid #26303A",
                borderRadius: 8,
                fontSize: 12,
                color: "#F1F5F9",
              }}
              labelStyle={{ color: "#8B98A7", marginBottom: 4 }}
            />
            <Area type="monotone" dataKey="allowed" stroke="#2DD4A7" strokeWidth={2} fill="url(#gAllowed)" dot={false} />
            <Area type="monotone" dataKey="denied"  stroke="#F05D5E" strokeWidth={2} fill="url(#gDenied)"  dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Secondary panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Unhealthy Servers */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pc-border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>Unhealthy Servers</h2>
            <Link href="/dashboard/servers" className="text-xs" style={{ color: "var(--pc-primary)" }}>
              View all
            </Link>
          </div>
          {loadingServers ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
              ))}
            </div>
          ) : unhealthySvrs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <CheckCircle2 className="w-6 h-6" style={{ color: "#35C88A" }} strokeWidth={1.5} />
              <p className="text-sm" style={{ color: "var(--pc-muted)" }}>All servers healthy</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--pc-border)" }}>
              {unhealthySvrs.map((s) => {
                const cfg = statusConfig(s.status);
                return (
                  <div
                    key={s.slug}
                    className="flex items-center justify-between px-5 py-3 transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      <span className="text-xs font-mono truncate" style={{ color: "var(--pc-foreground)" }}>{s.slug}</span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {s.status}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/servers/${s.slug}`}
                      className="text-xs font-medium ml-4 flex-shrink-0"
                      style={{ color: "var(--pc-primary)" }}
                    >
                      View
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Security Alerts */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pc-border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>Security Alerts</h2>
            <Link href="/dashboard/audit" className="text-xs" style={{ color: "var(--pc-primary)" }}>
              View all
            </Link>
          </div>
          {loadingAudit ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
              ))}
            </div>
          ) : deniedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <ShieldAlert className="w-6 h-6" style={{ color: "var(--pc-muted)", opacity: 0.4 }} strokeWidth={1.5} />
              <p className="text-sm" style={{ color: "var(--pc-muted)" }}>No denied requests</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--pc-border)" }}>
              {deniedEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between px-5 py-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3 h-3 flex-shrink-0" style={{ color: "#F05D5E" }} strokeWidth={2.5} />
                      <code className="text-xs font-mono truncate" style={{ color: "var(--pc-foreground)" }}>
                        {evt.tool_name ?? evt.event_type}
                      </code>
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "var(--pc-muted)" }}>
                        {evt.event_type}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs tabular-nums ml-4 flex-shrink-0" style={{ color: "var(--pc-muted)" }}>
                    {relativeTime(evt.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent audit events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Recent Audit Events
          </h2>
          <Link
            href="/dashboard/audit"
            className="flex items-center gap-1 text-xs font-medium transition-colors"
            style={{ color: "var(--pc-primary)" }}
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {loadingAudit ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
              ))}
            </div>
          ) : recentAudit.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Activity className="w-8 h-8 mb-3" strokeWidth={1.5} style={{ color: "var(--pc-muted)", opacity: 0.4 }} />
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>No events yet</p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                Events appear here as traffic flows through the gateway
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
                  {["Outcome", "Event", "Server", "Tool", "Time"].map((h, i) => (
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
                {recentAudit.map((evt) => {
                  const cfg  = outcomeConfig(evt.outcome);
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={evt.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          <Icon className="w-3 h-3" strokeWidth={2.5} />
                          {evt.outcome}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <code className="text-xs font-mono" style={{ color: "var(--pc-foreground)" }}>
                          {evt.event_type}
                        </code>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
                        {evt.server_slug ?? <span style={{ color: "var(--pc-border)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
                        {evt.tool_name ?? <span style={{ color: "var(--pc-border)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-right tabular-nums" style={{ color: "var(--pc-muted)" }}>
                        {new Date(evt.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Denied banner */}
      {denied > 0 && (
        <div
          className="rounded-2xl border px-5 py-4 flex items-center gap-4"
          style={{ background: "rgba(240,93,94,0.08)", borderColor: "rgba(240,93,94,0.3)" }}
        >
          <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#F05D5E" }} strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#F05D5E" }}>
              {denied} denied request{denied > 1 ? "s" : ""} in recent window
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
              Review your policies or audit log for details
            </p>
          </div>
          <Link
            href="/dashboard/audit"
            className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(240,93,94,0.15)", color: "#F05D5E" }}
          >
            View audit
          </Link>
        </div>
      )}

      {/* Quick-Start Checklist */}
      <div
        className="rounded-2xl border px-6 py-5"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
          Quick-Start Checklist
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {checklist.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 p-3 rounded-xl border transition-colors group"
              style={{
                background: item.done ? "rgba(53,200,138,0.06)" : "var(--pc-elevated)",
                borderColor: item.done ? "rgba(53,200,138,0.2)" : "var(--pc-border)",
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors"
                style={
                  item.done
                    ? { background: "#35C88A", borderColor: "#35C88A" }
                    : { background: "transparent", borderColor: "var(--pc-border)" }
                }
              >
                {item.done && <CircleCheck className="w-3 h-3" style={{ color: "#0C1116" }} strokeWidth={3} />}
              </div>
              <span
                className="text-xs font-medium"
                style={{
                  color: item.done ? "var(--pc-muted)" : "var(--pc-foreground)",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
