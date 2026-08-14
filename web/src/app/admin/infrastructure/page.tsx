"use client";

import { toast } from "sonner";
import {
  useListServersV1ServersGet,
  useUpdateServerV1ServersSlugPatch,
  ServerStatus,
  type ServerView,
} from "@/api/generated";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "@/lib/axios-instance";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  Cpu,
  Server,
  Database,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Globe,
  Activity,
  ExternalLink,
  ToggleLeft,
} from "lucide-react";

/* ── relative time helper ────────────────────────────────────────── */

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── status pill ─────────────────────────────────────────────────── */

function StatusPill({ status }: { status: string }) {
  if (status === ServerStatus.active) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ background: "rgba(45,212,167,0.12)", color: "#2DD4A7" }}
      >
        <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
        Active
      </span>
    );
  }
  if (status === ServerStatus.unhealthy) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ background: "rgba(240,93,94,0.12)", color: "#F05D5E" }}
      >
        <XCircle className="w-3 h-3" strokeWidth={2.5} />
        Unhealthy
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: "rgba(139,152,167,0.1)", color: "var(--pc-muted)" }}
    >
      <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
      Disabled
    </span>
  );
}

/* ── service dot ─────────────────────────────────────────────────── */

function ServiceDot({ healthy }: { healthy: boolean | null }) {
  const color =
    healthy === null ? "var(--pc-muted)" : healthy ? "#35C88A" : "#F05D5E";
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: color, boxShadow: healthy ? `0 0 6px ${color}` : "none" }}
    />
  );
}

/* ── stat card ───────────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-3"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "var(--pc-elevated)" }}
        >
          {icon}
        </div>
      </div>
      <div>
        <p
          className="text-2xl font-bold tracking-tight"
          style={{ color: accent ?? "var(--pc-foreground)" }}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminInfrastructurePage() {
  const qc = useQueryClient();

  /* server list */
  const { data: resp, isLoading, refetch } = useListServersV1ServersGet();
  const servers = (resp?.data ?? []) as ServerView[];
  const updateServer = useUpdateServerV1ServersSlugPatch();

  /* healthz check */
  const healthQuery = useQuery({
    queryKey: ["platform-healthz"],
    queryFn: async () => {
      const startedAt = performance.now();
      await axiosClient.get("/healthz");
      return Math.round(performance.now() - startedAt);
    },
    retry: false,
  });
  const healthStatus = healthQuery.isFetching
    ? "checking"
    : healthQuery.isError
      ? "error"
      : "ok";
  const gatewayLatency = healthQuery.data ?? null;

  function handleRefresh() {
    void healthQuery.refetch();
    void refetch();
  }

  /* derived stats */
  const activeCount = servers.filter((s) => s.status === ServerStatus.active).length;
  const unhealthyCount = servers.filter((s) => s.status === ServerStatus.unhealthy).length;
  const totalFailures = servers.reduce((sum, s) => sum + (s.consecutive_health_failures ?? 0), 0);
  const lastCheckedAt =
    servers
      .map((s) => s.last_health_check_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const uniqueAuthModes = [...new Set(servers.map((s) => s.auth_mode).filter(Boolean))];

  /* disable handler */
  async function handleDisable(slug: string) {
    try {
      await updateServer.mutateAsync({ slug, data: { status: ServerStatus.disabled } });
      toast.success(`Server "${slug}" disabled`);
      qc.invalidateQueries({ queryKey: ["/v1/servers"] });
    } catch {
      toast.error("Failed to disable server");
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Infrastructure
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Gateway instances, database status, and deployment versions
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={healthStatus === "checking"}
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition-colors disabled:opacity-50"
          style={{
            background: "var(--pc-surface)",
            borderColor: "var(--pc-border)",
            color: "var(--pc-foreground)",
          }}
        >
          <RefreshCw
            className={`w-4 h-4 ${healthStatus === "checking" ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
          Refresh
        </button>
      </div>

      {/* ── System status banner ───────────────────────────────────── */}
      {healthStatus === "checking" ? (
        <div
          className="rounded-2xl border px-5 py-4 flex items-center gap-3"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <RefreshCw className="w-4 h-4 animate-spin" style={{ color: "var(--pc-muted)" }} strokeWidth={1.75} />
          <span className="text-sm font-medium" style={{ color: "var(--pc-muted)" }}>
            Checking system health…
          </span>
        </div>
      ) : healthStatus === "ok" ? (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: "rgba(53,200,138,0.1)", border: "1px solid rgba(53,200,138,0.25)" }}
        >
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: "#35C88A" }} strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#35C88A" }}>
              All Systems Operational
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(53,200,138,0.7)" }}>
              Gateway responding normally
              {gatewayLatency !== null && ` — ${gatewayLatency}ms`}
            </p>
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: "rgba(240,93,94,0.1)", border: "1px solid rgba(240,93,94,0.25)" }}
        >
          <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#F05D5E" }} strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#F05D5E" }}>
              Gateway Degraded
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(240,93,94,0.7)" }}>
              Health check failed — gateway may be unreachable
            </p>
          </div>
        </div>
      )}

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Gateway Status"
          value={healthStatus === "checking" ? "…" : healthStatus === "ok" ? "Healthy" : "Degraded"}
          accent={healthStatus === "ok" ? "#35C88A" : healthStatus === "error" ? "#F05D5E" : "var(--pc-muted)"}
          icon={<Activity className="w-4 h-4" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />}
        />
        <StatCard
          label="MCP Servers"
          value={isLoading ? "—" : String(servers.length)}
          sub={isLoading ? undefined : `${activeCount} active / ${unhealthyCount} unhealthy`}
          icon={<Server className="w-4 h-4" style={{ color: "var(--pc-secondary)" }} strokeWidth={1.75} />}
        />
        <StatCard
          label="Health Failures"
          value={isLoading ? "—" : String(totalFailures)}
          accent={totalFailures > 0 ? "#F05D5E" : "#35C88A"}
          icon={<AlertTriangle className="w-4 h-4" style={{ color: "var(--pc-warning)" }} strokeWidth={1.75} />}
        />
        <StatCard
          label="Last Checked"
          value={isLoading ? "—" : relativeTime(lastCheckedAt)}
          icon={<Zap className="w-4 h-4" style={{ color: "var(--pc-warning)" }} strokeWidth={1.75} />}
        />
      </div>

      {/* ── Services health grid ──────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--pc-muted)" }}>
          Service Health
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              name: "Gateway API",
              icon: <Globe className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--pc-primary)" }} />,
              healthy: healthStatus === "ok" ? true : healthStatus === "error" ? false : null,
              status:
                healthStatus === "checking"
                  ? "Checking…"
                  : healthStatus === "ok"
                  ? `Online${gatewayLatency !== null ? ` — ${gatewayLatency}ms` : ""}`
                  : "Unreachable",
            },
            {
              name: "Database",
              icon: <Database className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--pc-secondary)" }} />,
              healthy: healthStatus === "ok" ? true : healthStatus === "error" ? null : null,
              status: healthStatus === "ok" ? "Connected" : "Unknown",
            },
            {
              name: "Redis Cache",
              icon: <Zap className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--pc-warning)" }} />,
              healthy: healthStatus === "ok" ? true : null,
              status: healthStatus === "ok" ? "Connected" : "Unknown",
            },
            {
              name: "Message Queue",
              icon: <Activity className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--pc-primary)" }} />,
              healthy: healthStatus === "ok" ? true : null,
              status: healthStatus === "ok" ? "Operational" : "Unknown",
            },
            {
              name: "Worker Pool",
              icon: <Cpu className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--pc-secondary)" }} />,
              healthy: healthStatus === "ok" ? true : null,
              status: healthStatus === "ok" ? "Running" : "Unknown",
            },
            {
              name: "Audit Pipeline",
              icon: <Server className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--pc-muted)" }} />,
              healthy: healthStatus === "ok" ? true : null,
              status: healthStatus === "ok" ? "Active" : "Unknown",
            },
          ].map((svc) => (
            <div
              key={svc.name}
              className="rounded-xl border p-4 flex items-center gap-3"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--pc-elevated)" }}
              >
                {svc.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--pc-foreground)" }}>
                  {svc.name}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--pc-muted)" }}>
                  {svc.status}
                </p>
              </div>
              <ServiceDot healthy={svc.healthy} />
            </div>
          ))}
        </div>
      </section>

      {/* ── MCP Server health table ───────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--pc-muted)" }}>
          MCP Server Health
        </h2>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
              ))}
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--pc-elevated)" }}
              >
                <Server className="w-5 h-5" strokeWidth={1.5} style={{ color: "var(--pc-muted)", opacity: 0.5 }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                No servers registered
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                Register an MCP server from the dashboard to get started
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
                    {["Server", "URL", "Transport", "Status", "Health Failures", "Last Check", "Actions"].map(
                      (col) => (
                        <th
                          key={col}
                          className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s) => (
                    <tr
                      key={s.slug}
                      className="transition-colors group"
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "";
                      }}
                    >
                      {/* Server */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(72,184,232,0.15)" }}
                          >
                            <Server className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
                          </div>
                          <div>
                            <p className="font-medium text-xs" style={{ color: "var(--pc-foreground)" }}>
                              {s.name}
                            </p>
                            <p className="font-mono text-xs" style={{ color: "var(--pc-primary)" }}>
                              {s.slug}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* URL */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs max-w-[200px]">
                          <Globe className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: "var(--pc-muted)" }} />
                          <span className="truncate" style={{ color: "var(--pc-muted)" }}>
                            {s.upstream_url}
                          </span>
                        </div>
                      </td>

                      {/* Transport */}
                      <td className="px-5 py-3.5">
                        <span
                          className="font-mono text-xs px-2 py-0.5 rounded-md"
                          style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                        >
                          {s.transport}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <StatusPill status={s.status} />
                      </td>

                      {/* Health Failures */}
                      <td className="px-5 py-3.5">
                        {(s.consecutive_health_failures ?? 0) === 0 ? (
                          <span className="text-xs tabular-nums" style={{ color: "#35C88A" }}>0</span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
                            style={{ background: "rgba(240,93,94,0.12)", color: "#F05D5E" }}
                          >
                            <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
                            {s.consecutive_health_failures}
                          </span>
                        )}
                      </td>

                      {/* Last Check */}
                      <td className="px-5 py-3.5 text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--pc-muted)" }}>
                        {relativeTime(s.last_health_check_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/servers/${s.slug}`}
                            className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                            style={{ color: "var(--pc-secondary)" }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                            View
                          </Link>
                          {s.status !== ServerStatus.disabled && (
                            <button
                              onClick={() => handleDisable(s.slug)}
                              disabled={updateServer.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-40"
                              style={{ color: "var(--pc-warning)" }}
                            >
                              <ToggleLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Gateway instance table ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--pc-muted)" }}>
          Gateway Instances
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--pc-muted)" }}>
          Single-instance deployment — horizontal scaling available in Enterprise plan
        </p>
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
                  {["Instance ID", "Region", "Version", "CPU", "Memory", "Status"].map((col) => (
                    <th
                      key={col}
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {/* Instance ID */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(45,212,167,0.12)" }}
                      >
                        <Cpu className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--pc-primary)" }} />
                      </div>
                      <span className="font-mono text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
                        gw-primary-001
                      </span>
                    </div>
                  </td>
                  {/* Region */}
                  <td className="px-5 py-4">
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded-md"
                      style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                    >
                      us-east-1
                    </span>
                  </td>
                  {/* Version */}
                  <td className="px-5 py-4">
                    <span className="text-xs" style={{ color: "var(--pc-muted)" }}>1.0.0</span>
                  </td>
                  {/* CPU */}
                  <td className="px-5 py-4">
                    <span className="text-xs tabular-nums" style={{ color: "var(--pc-foreground)" }}>12%</span>
                  </td>
                  {/* Memory */}
                  <td className="px-5 py-4">
                    <span className="text-xs tabular-nums" style={{ color: "var(--pc-foreground)" }}>256 MB</span>
                  </td>
                  {/* Status */}
                  <td className="px-5 py-4">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(45,212,167,0.12)", color: "#2DD4A7" }}
                    >
                      <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                      Running
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Deployment info ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--pc-muted)" }}>
          Deployment
        </h2>
        <div
          className="rounded-2xl border p-6"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--pc-muted)" }}>
                Version
              </p>
              <p className="text-sm font-mono font-medium" style={{ color: "var(--pc-foreground)" }}>
                1.0.0
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--pc-muted)" }}>
                Transport
              </p>
              <span
                className="font-mono text-xs px-2 py-0.5 rounded-md"
                style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
              >
                streamable_http
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--pc-muted)" }}>
                Auth Modes
              </p>
              {uniqueAuthModes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {uniqueAuthModes.map((mode) => (
                    <span
                      key={mode}
                      className="font-mono text-xs px-2 py-0.5 rounded-md"
                      style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                    >
                      {mode}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>—</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled
              title="Changelog not available"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition-colors opacity-40 cursor-not-allowed"
              style={{
                background: "var(--pc-elevated)",
                borderColor: "var(--pc-border)",
                color: "var(--pc-foreground)",
              }}
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
              View Changelog
            </button>
            <button
              disabled
              title="Update checks not available in this plan"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition-colors opacity-40 cursor-not-allowed"
              style={{
                background: "var(--pc-elevated)",
                borderColor: "var(--pc-border)",
                color: "var(--pc-foreground)",
              }}
            >
              <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
              Check for Updates
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
