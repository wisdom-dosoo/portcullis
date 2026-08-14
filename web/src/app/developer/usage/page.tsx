"use client";

import {
  useListAuditLogsV1AuditGet,
  useListPoliciesV1RateLimitPoliciesGet,
  type AuditLogView,
  type RateLimitPolicyView,
} from "@/api/generated";
import { Activity, CheckCircle2, XCircle, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
}: {
  label: string;
  value: number;
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
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16 mb-1" style={{ background: "var(--pc-elevated)" }} />
      ) : (
        <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--pc-foreground)" }}>
          {value}
        </p>
      )}
      <p className="text-xs font-medium mt-1" style={{ color: "var(--pc-muted)" }}>
        {label}
      </p>
    </div>
  );
}

// ─── Outcome pill ──────────────────────────────────────────────────────────

function OutcomePill({ outcome }: { outcome: string }) {
  const allowed = outcome === "allowed";
  const denied = outcome === "denied";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={
        allowed
          ? { background: "rgba(53,200,138,0.12)", color: "#35C88A" }
          : denied
          ? { background: "rgba(240,93,94,0.12)", color: "#F05D5E" }
          : { background: "rgba(244,185,66,0.12)", color: "#F4B942" }
      }
    >
      {outcome}
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperUsagePage() {
  const { data: auditResp, isLoading: auditLoading } = useListAuditLogsV1AuditGet({ limit: 100 });
  const { data: policiesResp, isLoading: policiesLoading } = useListPoliciesV1RateLimitPoliciesGet();

  const logs = (Array.isArray(auditResp?.data) ? auditResp.data : []) as AuditLogView[];
  const policies = (Array.isArray(policiesResp?.data) ? policiesResp.data : []) as RateLimitPolicyView[];

  const total = logs.length;
  const allowed = logs.filter((l) => l.outcome === "allowed").length;
  const denied = logs.filter((l) => l.outcome === "denied").length;
  const allowedPct = total > 0 ? Math.round((allowed / total) * 100) : 0;
  const deniedPct = total > 0 ? Math.round((denied / total) * 100) : 0;

  const recent = logs.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          My Usage
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Request history and quota status
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Requests"
          value={total}
          icon={Activity}
          iconColor="#48B8E8"
          iconBg="rgba(72,184,232,0.15)"
          loading={auditLoading}
        />
        <StatCard
          label="Allowed"
          value={allowed}
          icon={CheckCircle2}
          iconColor="#35C88A"
          iconBg="rgba(53,200,138,0.15)"
          loading={auditLoading}
        />
        <StatCard
          label="Blocked"
          value={denied}
          icon={XCircle}
          iconColor="#F05D5E"
          iconBg="rgba(240,93,94,0.15)"
          loading={auditLoading}
        />
      </div>

      {/* Request Breakdown */}
      <div
        className="rounded-2xl border p-6"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
          Request Breakdown
        </h2>
        {auditLoading ? (
          <Skeleton className="h-8 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
        ) : total === 0 ? (
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            No requests recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Allowed bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: "#35C88A" }}
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
                    Allowed
                  </span>
                </div>
                <span className="text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                  {allowed} / {total} ({allowedPct}%)
                </span>
              </div>
              <div
                className="w-full rounded-full overflow-hidden"
                style={{ height: 8, background: "var(--pc-elevated)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${allowedPct}%`, background: "#35C88A" }}
                />
              </div>
            </div>

            {/* Denied bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: "#F05D5E" }}
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
                    Blocked
                  </span>
                </div>
                <span className="text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                  {denied} / {total} ({deniedPct}%)
                </span>
              </div>
              <div
                className="w-full rounded-full overflow-hidden"
                style={{ height: 8, background: "var(--pc-elevated)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${deniedPct}%`, background: "#F05D5E" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rate Limit Policies */}
      <div
        className="rounded-2xl border p-6"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
          Rate Limit Policies
        </h2>
        {policiesLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <div className="flex items-center gap-3 py-4" style={{ color: "var(--pc-muted)" }}>
            <Zap className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">No rate limit policies configured.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {policies.map((p) => (
              <div
                key={p.id}
                className="rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap"
                style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(244,185,66,0.12)" }}
                >
                  <Zap className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F4B942" }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "var(--pc-foreground)" }}>
                    {p.server_pattern ?? "*"}{" "}
                    {p.tool_pattern ? `/ ${p.tool_pattern}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                    {p.algorithm}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs tabular-nums">
                  <span
                    className="px-2.5 py-1 rounded-lg font-medium"
                    style={{ background: "rgba(45,212,167,0.1)", color: "#2DD4A7" }}
                  >
                    {p.request_limit} req
                  </span>
                  <span style={{ color: "var(--pc-muted)" }}>
                    / {p.window_seconds}s
                  </span>
                  {p.burst_capacity !== null && (
                    <span style={{ color: "var(--pc-muted)" }}>
                      burst: {p.burst_capacity}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity table */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--pc-foreground)" }}>
          Recent Activity
        </h2>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {auditLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Activity
                className="w-8 h-8 mb-3"
                strokeWidth={1.5}
                style={{ color: "var(--pc-muted)", opacity: 0.4 }}
              />
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                No recent activity
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                Events appear here as traffic flows through the gateway
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  <tr>
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
                  {recent.map((log) => (
                    <tr
                      key={log.id}
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "")
                      }
                    >
                      <td className="px-5 py-3">
                        <OutcomePill outcome={log.outcome} />
                      </td>
                      <td className="px-5 py-3">
                        <code
                          className="text-xs font-mono"
                          style={{ color: "var(--pc-secondary)" }}
                        >
                          {log.event_type}
                        </code>
                      </td>
                      <td
                        className="px-5 py-3 text-xs font-mono"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {log.server_slug ?? (
                          <span style={{ color: "var(--pc-border)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 text-xs font-mono"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {log.tool_name ?? (
                          <span style={{ color: "var(--pc-border)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 text-xs text-right tabular-nums whitespace-nowrap"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
