"use client";

import { useState } from "react";
import {
  useListAuditLogsV1AuditGet,
  AuditEventType,
  type AuditLogView,
} from "@/api/generated";
import {
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, FilterEmpty, EMPTY_STATES } from "@/components/empty-state";

// ─── Outcome config ────────────────────────────────────────────────────────

function outcomeConfig(outcome: string) {
  if (outcome === "allowed")
    return {
      icon: CheckCircle2,
      style: { background: "rgba(53,200,138,0.12)", color: "#35C88A" },
    };
  if (outcome === "denied")
    return {
      icon: XCircle,
      style: { background: "rgba(240,93,94,0.12)", color: "#F05D5E" },
    };
  return {
    icon: AlertTriangle,
    style: { background: "rgba(244,185,66,0.12)", color: "#F4B942" },
  };
}

// ─── Shared select style ───────────────────────────────────────────────────

const controlStyle: React.CSSProperties = {
  background: "var(--pc-elevated)",
  borderColor: "var(--pc-border)",
  color: "var(--pc-foreground)",
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperLogsPage() {
  const [eventType, setEventType] = useState<string>("");
  const [serverSlug, setServerSlug] = useState("");
  const [limit, setLimit] = useState(25);

  const { data: resp, isLoading, refetch, isFetching } =
    useListAuditLogsV1AuditGet({
      event_type:
        (eventType as (typeof AuditEventType)[keyof typeof AuditEventType]) ||
        undefined,
      server_slug: serverSlug || undefined,
      limit,
    });

  const logs = (Array.isArray(resp?.data) ? resp.data : []) as AuditLogView[];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Request Logs
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Your gateway request history
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-xl border disabled:opacity-50 transition-colors"
          style={{
            color: "var(--pc-foreground)",
            borderColor: "var(--pc-border)",
            background: "var(--pc-surface)",
          }}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div
        className="rounded-2xl border p-4"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter
            className="w-3.5 h-3.5"
            strokeWidth={1.75}
            style={{ color: "var(--pc-muted)" }}
          />
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--pc-muted)" }}
          >
            Filters
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border outline-none"
            style={controlStyle}
          >
            <option value="">All event types</option>
            {Object.values(AuditEventType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={serverSlug}
            onChange={(e) => setServerSlug(e.target.value)}
            placeholder="Filter by server slug…"
            className="px-3 py-2 text-sm rounded-xl border outline-none"
            style={{ ...controlStyle, minWidth: 180 }}
          />

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 text-sm rounded-xl border outline-none"
            style={controlStyle}
          >
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
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
        ) : logs.length === 0 ? (
          eventType || serverSlug ? (
            <FilterEmpty subject="log entries" onClear={() => { setEventType(""); setServerSlug(""); }} />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={EMPTY_STATES.requests.title}
              description={EMPTY_STATES.requests.description}
              features={[...EMPTY_STATES.requests.features]}
              actions={[
                { label: EMPTY_STATES.requests.primaryAction.label, href: EMPTY_STATES.requests.primaryAction.href },
                { label: EMPTY_STATES.requests.docsAction.label,    href: EMPTY_STATES.requests.docsAction.href, variant: "secondary" },
              ]}
            />
          )
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
                  {["Outcome", "Event", "Server", "Tool", "Subject", "IP", "Time"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${i === 6 ? "text-right" : "text-left"}`}
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const cfg = outcomeConfig(log.outcome);
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={log.id}
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.02)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "")
                      }
                    >
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                          style={cfg.style}
                        >
                          <Icon className="w-3 h-3" strokeWidth={2.5} />
                          {log.outcome}
                        </span>
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
                        style={{ color: "var(--pc-secondary)" }}
                      >
                        {log.server_slug ?? (
                          <span style={{ color: "var(--pc-border)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 text-xs font-mono"
                        style={{ color: "var(--pc-secondary)" }}
                      >
                        {log.tool_name ?? (
                          <span style={{ color: "var(--pc-border)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 text-xs max-w-[140px] truncate"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {log.subject_id ?? (
                          <span style={{ color: "var(--pc-border)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 text-xs tabular-nums"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {log.client_ip ?? (
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
