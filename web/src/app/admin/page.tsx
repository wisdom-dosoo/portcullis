"use client";

import Link from "next/link";
import {
  useListServersV1ServersGet,
  useListApiKeysV1ApiKeysGet,
  useListRolesV1RolesGet,
  useListAuditLogsV1AuditGet,
  useListPoliciesV1RateLimitPoliciesGet,
  type AuditLogView,
} from "@/api/generated";
import {
  Server,
  Key,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  Activity,
  BarChart3,
  Settings,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ── outcome helpers ─────────────────────────────────────────────── */

function outcomeConfig(outcome: string) {
  if (outcome === "allowed")
    return { icon: CheckCircle2, color: "#35C88A", bg: "rgba(53,200,138,0.12)" };
  if (outcome === "denied")
    return { icon: XCircle, color: "#F05D5E", bg: "rgba(240,93,94,0.12)" };
  return { icon: AlertTriangle, color: "#F4B942", bg: "rgba(244,185,66,0.12)" };
}

/* ── stat card ───────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  loading: boolean;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-start justify-between mb-3">
        <p
          className="text-xs font-medium uppercase tracking-widest"
          style={{ color: "var(--pc-muted)" }}
        >
          {label}
        </p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="w-4.5 h-4.5" strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16 mt-1" style={{ background: "var(--pc-elevated)" }} />
      ) : (
        <p
          className="text-3xl font-bold mt-1 tabular-nums"
          style={{ color: "var(--pc-foreground)" }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

/* ── quick link tile ─────────────────────────────────────────────── */

function QuickLink({
  href,
  label,
  description,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border p-4 flex items-start gap-3 transition-colors hover:border-opacity-60"
      style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "var(--pc-elevated)";
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}
      >
        <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
          {label}
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
          {description}
        </p>
      </div>
      <ArrowRight
        className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
        style={{ color: "var(--pc-primary)" }}
      />
    </Link>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminOverviewPage() {
  const { data: serversResp, isLoading: loadingServers } = useListServersV1ServersGet();
  const { data: keysResp, isLoading: loadingKeys } = useListApiKeysV1ApiKeysGet();
  const { data: rolesResp, isLoading: loadingRoles } = useListRolesV1RolesGet();
  const { data: policiesResp, isLoading: loadingPolicies } =
    useListPoliciesV1RateLimitPoliciesGet();
  const { data: auditResp, isLoading: loadingAudit } = useListAuditLogsV1AuditGet({
    limit: 5,
  });

  const servers = Array.isArray(serversResp?.data) ? serversResp.data : [];
  const keys = Array.isArray(keysResp?.data) ? keysResp.data : [];
  const roles = Array.isArray(rolesResp?.data) ? rolesResp.data : [];
  const policies = Array.isArray(policiesResp?.data) ? policiesResp.data : [];
  const auditLogs = (
    Array.isArray(auditResp?.data) ? auditResp.data : []
  ) as AuditLogView[];

  const activeServers = servers.filter(
    (s: { status: string }) => s.status === "active"
  ).length;
  const deniedCount = auditLogs.filter((a) => a.outcome === "denied").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Platform Overview
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          System-wide health and activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Servers"
          value={servers.length}
          icon={Server}
          iconColor="#48B8E8"
          iconBg="rgba(72,184,232,0.15)"
          loading={loadingServers}
        />
        <StatCard
          label="API Keys"
          value={keys.length}
          icon={Key}
          iconColor="#2DD4A7"
          iconBg="rgba(45,212,167,0.15)"
          loading={loadingKeys}
        />
        <StatCard
          label="Active Roles"
          value={roles.length}
          icon={Shield}
          iconColor="#F4B942"
          iconBg="rgba(244,185,66,0.15)"
          loading={loadingRoles}
        />
        <StatCard
          label="Rate Limit Policies"
          value={policies.length}
          icon={Zap}
          iconColor="#F05D5E"
          iconBg="rgba(240,93,94,0.15)"
          loading={loadingPolicies}
        />
      </div>

      {/* Platform health + quick links row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Health */}
        <div
          className="rounded-2xl border p-6"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
            Platform Health
          </h2>
          <div className="space-y-3">
            {/* Server status row */}
            <div
              className="flex items-center justify-between py-2.5 px-3 rounded-xl"
              style={{ background: "var(--pc-elevated)" }}
            >
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
                <span className="text-sm" style={{ color: "var(--pc-foreground)" }}>
                  Server status
                </span>
              </div>
              {loadingServers ? (
                <Skeleton className="h-5 w-24 rounded-md" style={{ background: "var(--pc-border)" }} />
              ) : (
                <span className="text-xs font-medium tabular-nums" style={{ color: "var(--pc-muted)" }}>
                  <span style={{ color: "#35C88A" }}>{activeServers} active</span>
                  {" / "}
                  {servers.length} total
                </span>
              )}
            </div>

            {/* Blocked requests row */}
            <div
              className="flex items-center justify-between py-2.5 px-3 rounded-xl"
              style={{ background: "var(--pc-elevated)" }}
            >
              <div className="flex items-center gap-2.5">
                <XCircle className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F05D5E" }} />
                <span className="text-sm" style={{ color: "var(--pc-foreground)" }}>
                  Recent blocked requests
                </span>
              </div>
              {loadingAudit ? (
                <Skeleton className="h-5 w-12 rounded-md" style={{ background: "var(--pc-border)" }} />
              ) : (
                <span
                  className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full"
                  style={
                    deniedCount > 0
                      ? { background: "rgba(240,93,94,0.12)", color: "#F05D5E" }
                      : { background: "rgba(53,200,138,0.12)", color: "#35C88A" }
                  }
                >
                  {deniedCount}
                </span>
              )}
            </div>

            {/* Policies active row */}
            <div
              className="flex items-center justify-between py-2.5 px-3 rounded-xl"
              style={{ background: "var(--pc-elevated)" }}
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F4B942" }} />
                <span className="text-sm" style={{ color: "var(--pc-foreground)" }}>
                  Policies active
                </span>
              </div>
              {loadingPolicies ? (
                <Skeleton className="h-5 w-12 rounded-md" style={{ background: "var(--pc-border)" }} />
              ) : (
                <span className="text-xs font-medium tabular-nums" style={{ color: "var(--pc-muted)" }}>
                  {policies.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div
          className="rounded-2xl border p-6"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink
              href="/admin/servers"
              label="MCP Servers"
              description="Manage upstream servers"
              icon={Server}
              iconColor="#48B8E8"
              iconBg="rgba(72,184,232,0.15)"
            />
            <QuickLink
              href="/admin/audit"
              label="Audit Logs"
              description="Review platform events"
              icon={ClipboardList}
              iconColor="#2DD4A7"
              iconBg="rgba(45,212,167,0.15)"
            />
            <QuickLink
              href="/admin/security"
              label="Security"
              description="Incidents and anomalies"
              icon={Shield}
              iconColor="#F05D5E"
              iconBg="rgba(240,93,94,0.15)"
            />
            <QuickLink
              href="/admin/settings"
              label="Settings"
              description="System configuration"
              icon={Settings}
              iconColor="#F4B942"
              iconBg="rgba(244,185,66,0.15)"
            />
          </div>
        </div>
      </div>

      {/* Recent audit events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Recent Audit Events
          </h2>
          <Link
            href="/admin/audit"
            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
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
              {[...Array(5)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 w-full rounded-lg"
                  style={{ background: "var(--pc-elevated)" }}
                />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--pc-elevated)" }}
              >
                <Activity
                  className="w-5 h-5"
                  strokeWidth={1.5}
                  style={{ color: "var(--pc-muted)", opacity: 0.5 }}
                />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                No events yet
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                Events appear here as traffic flows through the gateway
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
                  <tr>
                    {["Outcome", "Event", "Server", "Tool", "Time"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                          i === 4 ? "text-right" : "text-left"
                        }`}
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((evt) => {
                    const cfg = outcomeConfig(evt.outcome);
                    const Icon = cfg.icon;
                    return (
                      <tr
                        key={evt.id}
                        className="transition-colors"
                        style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "";
                        }}
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
                          <code
                            className="text-xs font-mono"
                            style={{ color: "var(--pc-foreground)" }}
                          >
                            {evt.event_type}
                          </code>
                        </td>
                        <td
                          className="px-5 py-3 text-xs font-mono"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {evt.server_slug ?? (
                            <span style={{ color: "var(--pc-border)" }}>—</span>
                          )}
                        </td>
                        <td
                          className="px-5 py-3 text-xs font-mono"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {evt.tool_name ?? (
                            <span style={{ color: "var(--pc-border)" }}>—</span>
                          )}
                        </td>
                        <td
                          className="px-5 py-3 text-xs text-right tabular-nums whitespace-nowrap"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {new Date(evt.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
