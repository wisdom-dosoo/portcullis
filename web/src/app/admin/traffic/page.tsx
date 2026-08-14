"use client";

import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Radio,
  Server,
  Wrench,
  Clock,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  AuditEventType,
  type AuditLogView,
  type ServerView,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Types ────────────────────────────────────────────────────────── */

type TimeRange = "1h" | "6h" | "24h" | "7d";

/* ── Helpers ──────────────────────────────────────────────────────── */

function timeRangeMs(range: TimeRange): number {
  switch (range) {
    case "1h":  return 60 * 60 * 1000;
    case "6h":  return 6 * 60 * 60 * 1000;
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d":  return 7 * 24 * 60 * 60 * 1000;
  }
}

function filterByTimeRange(logs: AuditLogView[], range: TimeRange): AuditLogView[] {
  const cutoff = Date.now() - timeRangeMs(range);
  return logs.filter((l) => new Date(l.created_at).getTime() >= cutoff);
}

function bucketByHour(logs: AuditLogView[], range: TimeRange) {
  const rangeMs = timeRangeMs(range);
  const bucketCount =
    range === "7d" ? 7 * 24 : range === "24h" ? 24 : range === "6h" ? 6 : 1;
  const bucketSize = rangeMs / bucketCount;
  const now = Date.now();

  const buckets: { label: string; allowed: number; denied: number }[] = Array.from(
    { length: bucketCount },
    (_, i) => {
      const bucketStart = now - rangeMs + i * bucketSize;
      const d = new Date(bucketStart);
      let label: string;
      if (range === "7d") {
        const day = d.toLocaleDateString(undefined, { weekday: "short" });
        const hr = d.getHours();
        label = hr === 0 ? day : `${hr}:00`;
      } else {
        label = `${d.getHours()}:00`;
      }
      return { label, allowed: 0, denied: 0 };
    }
  );

  for (const log of logs) {
    const t = new Date(log.created_at).getTime();
    const idx = Math.floor((t - (now - rangeMs)) / bucketSize);
    if (idx >= 0 && idx < bucketCount) {
      if (log.outcome === "allowed") {
        buckets[idx].allowed++;
      } else {
        buckets[idx].denied++;
      }
    }
  }

  return buckets;
}

function outcomeStyle(outcome: string) {
  if (outcome === "allowed")
    return { background: "rgba(53,200,138,0.12)", color: "#35C88A" };
  if (outcome === "denied")
    return { background: "rgba(240,93,94,0.12)", color: "#F05D5E" };
  return { background: "rgba(244,185,66,0.12)", color: "#F4B942" };
}

function OutcomePill({ outcome }: { outcome: string }) {
  const style = outcomeStyle(outcome);
  const Icon =
    outcome === "allowed"
      ? CheckCircle2
      : outcome === "denied"
      ? XCircle
      : AlertTriangle;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={style}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {outcome}
    </span>
  );
}

/* ── Stat Card ────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  loading: boolean;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
}: StatCardProps) {
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
          <Icon
            className="w-4.5 h-4.5"
            strokeWidth={1.75}
            style={{ color: iconColor }}
          />
        </div>
      </div>
      {loading ? (
        <Skeleton
          className="h-8 w-20 mt-1"
          style={{ background: "var(--pc-elevated)" }}
        />
      ) : (
        <>
          <p
            className="text-3xl font-bold mt-1 tabular-nums"
            style={{ color: "var(--pc-foreground)" }}
          >
            {value}
          </p>
          {sub && (
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              {sub}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ── Custom Tooltip ───────────────────────────────────────────────── */

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-4 py-3 shadow-lg text-xs"
      style={{
        background: "var(--pc-elevated)",
        borderColor: "var(--pc-border)",
        color: "var(--pc-foreground)",
      }}
    >
      <p className="font-semibold mb-2" style={{ color: "var(--pc-muted)" }}>
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: p.color }}
          />
          <span style={{ color: "var(--pc-foreground)" }}>
            {p.name}: <strong>{p.value}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function AdminTrafficPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [liveMode, setLiveMode] = useState(false);
  const [serverFilter, setServerFilter] = useState("");
  const qc = useQueryClient();

  // Fetch all audit logs
  const { data: allResp, isLoading: allLoading } = useListAuditLogsV1AuditGet({
    limit: 200,
  });

  // Fetch auth_failure events (for accurate auth failure count)
  const { data: authResp } = useListAuditLogsV1AuditGet({
    limit: 200,
    event_type: AuditEventType.auth_failure,
  });

  // Servers for filter dropdown
  const { data: serversResp } = useListServersV1ServersGet();

  const allLogs = (allResp?.data ?? []) as AuditLogView[];
  const authFailureLogs = (authResp?.data ?? []) as AuditLogView[];
  const servers = (serversResp?.data ?? []) as ServerView[];

  // Live mode: auto-refresh every 10s
  useEffect(() => {
    if (!liveMode) return;
    const iv = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["/v1/audit"] });
    }, 10_000);
    return () => clearInterval(iv);
  }, [liveMode, qc]);

  // Apply time range + server filter
  const filtered = useMemo(() => {
    let logs = filterByTimeRange(allLogs, timeRange);
    if (serverFilter) {
      logs = logs.filter((l) => l.server_slug === serverFilter);
    }
    return logs;
  }, [allLogs, timeRange, serverFilter]);

  // Stat derivations
  const total = filtered.length;
  const allowed = filtered.filter((l) => l.outcome === "allowed").length;
  const denied = filtered.filter((l) => l.outcome === "denied").length;
  const authFailures = filterByTimeRange(authFailureLogs, timeRange).length;
  const blockedPct = total > 0 ? Math.round((denied / total) * 100) : 0;

  // Chart data
  const chartData = useMemo(
    () => bucketByHour(filtered, timeRange),
    [filtered, timeRange]
  );

  // By server breakdown
  const byServer = useMemo(() => {
    const map = new Map<
      string,
      { allowed: number; denied: number; total: number }
    >();
    for (const log of filtered) {
      const key = log.server_slug ?? "(unknown)";
      const entry = map.get(key) ?? { allowed: 0, denied: 0, total: 0 };
      entry.total++;
      if (log.outcome === "allowed") entry.allowed++;
      else entry.denied++;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([slug, counts]) => ({ slug, ...counts }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  // By tool breakdown (top 10)
  const byTool = useMemo(() => {
    const map = new Map<
      string,
      { allowed: number; denied: number; total: number }
    >();
    for (const log of filtered) {
      if (!log.tool_name) continue;
      const entry = map.get(log.tool_name) ?? {
        allowed: 0,
        denied: 0,
        total: 0,
      };
      entry.total++;
      if (log.outcome === "allowed") entry.allowed++;
      else entry.denied++;
      map.set(log.tool_name, entry);
    }
    return [...map.entries()]
      .map(([tool, counts]) => ({ tool, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  // Recent 20 logs
  const recent = useMemo(() => filtered.slice(0, 20), [filtered]);

  const isLoading = allLoading;

  const selectStyle = {
    background: "var(--pc-elevated)",
    borderColor: "var(--pc-border)",
    color: "var(--pc-foreground)",
  } as const;

  const timeRanges: TimeRange[] = ["1h", "6h", "24h", "7d"];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Platform Traffic
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Real-time request volume, auth events, and tool invocation analytics
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range buttons */}
          <div
            className="flex items-center rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--pc-border)" }}
          >
            {timeRanges.map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className="px-3.5 py-2 text-xs font-semibold transition-colors"
                style={{
                  background:
                    timeRange === r
                      ? "var(--pc-primary)"
                      : "var(--pc-elevated)",
                  color: timeRange === r ? "#0C1116" : "var(--pc-muted)",
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Server filter */}
          <select
            value={serverFilter}
            onChange={(e) => setServerFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border outline-none"
            style={selectStyle}
          >
            <option value="">All servers</option>
            {servers.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Live toggle */}
          <button
            onClick={() => setLiveMode((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl border transition-colors"
            style={{
              background: liveMode
                ? "rgba(45,212,167,0.12)"
                : "var(--pc-elevated)",
              borderColor: liveMode ? "var(--pc-primary)" : "var(--pc-border)",
              color: liveMode ? "var(--pc-primary)" : "var(--pc-muted)",
            }}
          >
            <Radio
              className={`w-3.5 h-3.5 ${liveMode ? "animate-pulse" : ""}`}
              strokeWidth={2}
            />
            Live
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["/v1/audit"] })}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors"
            style={{
              background: "var(--pc-elevated)",
              borderColor: "var(--pc-border)",
              color: "var(--pc-muted)",
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Requests"
          value={isLoading ? "—" : total.toLocaleString()}
          icon={BarChart3}
          iconColor="#48B8E8"
          iconBg="rgba(72,184,232,0.12)"
          loading={isLoading}
        />
        <StatCard
          label="Allowed"
          value={isLoading ? "—" : allowed.toLocaleString()}
          icon={CheckCircle2}
          iconColor="#35C88A"
          iconBg="rgba(53,200,138,0.12)"
          loading={isLoading}
        />
        <StatCard
          label="Denied"
          value={isLoading ? "—" : denied.toLocaleString()}
          sub={total > 0 ? `${blockedPct}% blocked` : undefined}
          icon={XCircle}
          iconColor="#F05D5E"
          iconBg="rgba(240,93,94,0.12)"
          loading={isLoading}
        />
        <StatCard
          label="Auth Failures"
          value={isLoading ? "—" : authFailures.toLocaleString()}
          icon={AlertTriangle}
          iconColor="#F4B942"
          iconBg="rgba(244,185,66,0.12)"
          loading={isLoading}
        />
      </div>

      {/* ── Area Chart ── */}
      <div
        className="rounded-2xl border p-5"
        style={{
          background: "var(--pc-surface)",
          borderColor: "var(--pc-border)",
        }}
      >
        <p
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--pc-foreground)" }}
        >
          Requests Over Time
        </p>
        {isLoading ? (
          <Skeleton
            className="h-60 w-full rounded-xl"
            style={{ background: "var(--pc-elevated)" }}
          />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#35C88A" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#35C88A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDenied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F05D5E" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F05D5E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(38,48,58,0.6)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#8B98A7" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#8B98A7" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="allowed"
                name="Allowed"
                stroke="#35C88A"
                strokeWidth={1.75}
                fill="url(#gradAllowed)"
                dot={false}
                activeDot={{ r: 4, fill: "#35C88A", strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="denied"
                name="Denied"
                stroke="#F05D5E"
                strokeWidth={1.75}
                fill="url(#gradDenied)"
                dot={false}
                activeDot={{ r: 4, fill: "#F05D5E", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Two-column breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Server */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: "var(--pc-surface)",
            borderColor: "var(--pc-border)",
          }}
        >
          <div
            className="flex items-center gap-2 px-5 py-3.5 border-b"
            style={{
              borderColor: "var(--pc-border)",
              background: "var(--pc-elevated)",
            }}
          >
            <Server
              className="w-4 h-4"
              strokeWidth={1.75}
              style={{ color: "var(--pc-muted)" }}
            />
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--pc-muted)" }}
            >
              By Server
            </p>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-9 w-full rounded-lg"
                  style={{ background: "var(--pc-elevated)" }}
                />
              ))}
            </div>
          ) : byServer.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
                No data for this time range
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--pc-elevated)" }}>
                    {["Server", "Requests", "% Total", "Breakdown"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byServer.map((row) => {
                    const pct =
                      total > 0
                        ? Math.round((row.total / total) * 100)
                        : 0;
                    const allowedPct =
                      row.total > 0
                        ? (row.allowed / row.total) * 100
                        : 0;
                    return (
                      <tr
                        key={row.slug}
                        style={{ borderBottom: "1px solid var(--pc-border)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(255,255,255,0.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "";
                        }}
                      >
                        <td className="px-5 py-3">
                          <span
                            className="text-xs font-mono"
                            style={{ color: "var(--pc-secondary)" }}
                          >
                            {row.slug}
                          </span>
                        </td>
                        <td
                          className="px-5 py-3 text-xs tabular-nums"
                          style={{ color: "var(--pc-foreground)" }}
                        >
                          {row.total.toLocaleString()}
                        </td>
                        <td
                          className="px-5 py-3 text-xs tabular-nums"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {pct}%
                        </td>
                        <td className="px-5 py-3 w-24">
                          <div
                            className="w-full h-1.5 rounded-full overflow-hidden"
                            style={{ background: "rgba(240,93,94,0.3)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${allowedPct}%`,
                                background: "#35C88A",
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* By Tool */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: "var(--pc-surface)",
            borderColor: "var(--pc-border)",
          }}
        >
          <div
            className="flex items-center gap-2 px-5 py-3.5 border-b"
            style={{
              borderColor: "var(--pc-border)",
              background: "var(--pc-elevated)",
            }}
          >
            <Wrench
              className="w-4 h-4"
              strokeWidth={1.75}
              style={{ color: "var(--pc-muted)" }}
            />
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--pc-muted)" }}
            >
              Top Tools
            </p>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-9 w-full rounded-lg"
                  style={{ background: "var(--pc-elevated)" }}
                />
              ))}
            </div>
          ) : byTool.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
                No tool calls for this time range
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--pc-elevated)" }}>
                    {["Tool", "Calls", "Outcome"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTool.map((row) => (
                    <tr
                      key={row.tool}
                      style={{ borderBottom: "1px solid var(--pc-border)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "";
                      }}
                    >
                      <td className="px-5 py-3">
                        <span
                          className="text-xs font-mono"
                          style={{ color: "var(--pc-secondary)" }}
                        >
                          {row.tool}
                        </span>
                      </td>
                      <td
                        className="px-5 py-3 text-xs tabular-nums"
                        style={{ color: "var(--pc-foreground)" }}
                      >
                        {row.total.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          {row.allowed > 0 && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{
                                background: "rgba(53,200,138,0.12)",
                                color: "#35C88A",
                              }}
                            >
                              {row.allowed}✓
                            </span>
                          )}
                          {row.denied > 0 && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{
                                background: "rgba(240,93,94,0.12)",
                                color: "#F05D5E",
                              }}
                            >
                              {row.denied}✗
                            </span>
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
      </div>

      {/* ── Recent Requests Table ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: "var(--pc-surface)",
          borderColor: "var(--pc-border)",
        }}
      >
        <div
          className="flex items-center gap-2 px-5 py-3.5 border-b"
          style={{
            borderColor: "var(--pc-border)",
            background: "var(--pc-elevated)",
          }}
        >
          <Clock
            className="w-4 h-4"
            strokeWidth={1.75}
            style={{ color: "var(--pc-muted)" }}
          />
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--pc-muted)" }}
          >
            Recent Requests
          </p>
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "var(--pc-border)",
              color: "var(--pc-muted)",
            }}
          >
            Last 20
          </span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-10 w-full rounded-lg"
                style={{ background: "var(--pc-elevated)" }}
              />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--pc-elevated)" }}
            >
              <BarChart3
                className="w-5 h-5"
                strokeWidth={1.5}
                style={{ color: "var(--pc-muted)" }}
              />
            </div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--pc-foreground)" }}
            >
              No requests
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              Events will appear as traffic flows through the gateway
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--pc-elevated)" }}>
                <tr>
                  {[
                    "Time",
                    "Event",
                    "Server",
                    "Tool",
                    "Subject",
                    "Outcome",
                    "IP",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
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
                    style={{ borderBottom: "1px solid var(--pc-border)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "";
                    }}
                  >
                    <td
                      className="px-5 py-3 text-xs tabular-nums whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <code
                        className="text-xs font-mono"
                        style={{ color: "var(--pc-secondary)" }}
                      >
                        {log.event_type}
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      {log.server_slug ? (
                        <span
                          className="text-xs font-mono"
                          style={{ color: "var(--pc-secondary)" }}
                        >
                          {log.server_slug}
                        </span>
                      ) : (
                        <span style={{ color: "var(--pc-border)" }}>—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {log.tool_name ? (
                        <span
                          className="text-xs font-mono"
                          style={{ color: "var(--pc-foreground)" }}
                        >
                          {log.tool_name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--pc-border)" }}>—</span>
                      )}
                    </td>
                    <td
                      className="px-5 py-3 text-xs max-w-[120px] truncate"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {log.subject_id ?? (
                        <span style={{ color: "var(--pc-border)" }}>—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <OutcomePill outcome={log.outcome} />
                    </td>
                    <td
                      className="px-5 py-3 text-xs tabular-nums"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {log.client_ip ?? (
                        <span style={{ color: "var(--pc-border)" }}>—</span>
                      )}
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
