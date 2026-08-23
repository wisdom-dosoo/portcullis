"use client";

import { Server, Radar, Clock } from "lucide-react";
import {
  useAdminTelemetrySummaryAdminTelemetrySummaryGet,
  useAdminTelemetryInstancesAdminTelemetryInstancesGet,
  type InstanceSummaryView,
  type InstanceView,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

/* ── helpers ─────────────────────────────────────────────────────── */

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/* ── stat card ───────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  hint,
  loading,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  loading: boolean;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <p
        className="text-xs font-medium uppercase tracking-widest mb-2"
        style={{ color: "var(--pc-muted)" }}
      >
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-8 w-14 mt-1" style={{ background: "var(--pc-elevated)" }} />
      ) : (
        <p
          className="text-3xl font-bold tabular-nums"
          style={{ color: accent ?? "var(--pc-foreground)" }}
        >
          {value}
        </p>
      )}
      {hint && (
        <p className="text-xs mt-2" style={{ color: "var(--pc-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminTelemetryPage() {
  const { data: summaryResp, isLoading: summaryLoading } =
    useAdminTelemetrySummaryAdminTelemetrySummaryGet();
  const { data: instancesResp, isLoading: instancesLoading } =
    useAdminTelemetryInstancesAdminTelemetryInstancesGet();

  const summary = summaryResp?.data as InstanceSummaryView | undefined;
  const instances = (instancesResp?.data ?? []) as InstanceView[];

  const total = summary?.total ?? 0;
  const active24h = summary?.active_24h ?? 0;

  return (
    <div className="space-y-8" style={{ position: "relative" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Self-Host Telemetry
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Opt-in anonymous install heartbeats feeding the Phase 4 strategy review
        </p>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Installs"
          value={total}
          hint="Distinct self-hosts ever seen"
          loading={summaryLoading}
        />
        <StatCard
          label="Active (24h)"
          value={active24h}
          hint="Installs reporting in the last day"
          loading={summaryLoading}
          accent="#35C88A"
        />
        <StatCard
          label="Opt-in Rate"
          value={total > 0 ? Math.round((active24h / total) * 100) : 0}
          hint="Share of known installs active today"
          loading={summaryLoading}
          accent="#2DD4A7"
        />
        <StatCard
          label="Reported Servers"
          value={instances.reduce((sum, i) => sum + (i.server_count || 0), 0)}
          hint="Sum of registered MCP servers"
          loading={instancesLoading}
        />
      </div>

      {/* ── Instances table ─────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              style={{
                background: "var(--pc-elevated)",
                borderBottom: "1px solid var(--pc-border)",
              }}
            >
              <tr>
                {[
                  "Install ID",
                  "Version",
                  "Servers",
                  "First Seen",
                  "Last Seen",
                ].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                      i === 0 ? "text-left" : "text-left"
                    }`}
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instancesLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-4">
                    <div className="space-y-3">
                      {[...Array(2)].map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-14 w-full rounded-xl"
                          style={{ background: "var(--pc-elevated)" }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : instances.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      compact
                      icon={Radar}
                      title="No installs reporting yet"
                      description="Heartbeats appear here when a self-host enables telemetry and points it at this endpoint."
                    />
                  </td>
                </tr>
              ) : (
                instances.map((instance) => (
                  <tr
                    key={instance.install_id}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "";
                    }}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(45,212,167,0.15)" }}
                        >
                          <Server
                            className="w-4 h-4"
                            strokeWidth={1.75}
                            style={{ color: "#2DD4A7" }}
                          />
                        </div>
                        <div>
                          <p
                            className="text-xs font-mono"
                            style={{ color: "var(--pc-foreground)" }}
                          >
                            {instance.install_id}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                            {fmtDateTime(instance.last_seen_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          background: "rgba(244,185,66,0.15)",
                          color: "#F4B942",
                        }}
                      >
                        v{instance.version}
                      </span>
                    </td>
                    <td
                      className="px-5 py-4 text-xs tabular-nums"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {instance.server_count}
                    </td>
                    <td
                      className="px-5 py-4 text-xs tabular-nums whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      <Clock className="w-3 h-3 inline mr-1" />
                      {fmtDateTime(instance.first_seen_at)}
                    </td>
                    <td
                      className="px-5 py-4 text-xs tabular-nums whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {fmtDateTime(instance.last_seen_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!instancesLoading && instances.length > 0 && (
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--pc-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Showing {instances.length} install{instances.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Anonymous · opt-in only
            </p>
          </div>
        )}
      </div>
    </div>
  );
}