"use client";

import { useState } from "react";
import {
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  AuditEventType,
  type AuditLogView,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";

const OUTCOME_CONFIG = {
  allowed: {
    icon: CheckCircle2,
    style: { background: "rgba(53,200,138,0.12)", color: "#35C88A" },
  },
  denied: {
    icon: XCircle,
    style: { background: "rgba(240,93,94,0.12)", color: "#F05D5E" },
  },
  default: {
    icon: AlertTriangle,
    style: { background: "rgba(244,185,66,0.12)", color: "#F4B942" },
  },
} as const;

function outcomeConfig(outcome: string) {
  if (outcome === "allowed") return OUTCOME_CONFIG.allowed;
  if (outcome === "denied") return OUTCOME_CONFIG.denied;
  return OUTCOME_CONFIG.default;
}

const selectStyle = {
  background: "var(--pc-elevated)",
  borderColor: "var(--pc-border)",
  color: "var(--pc-foreground)",
};

export default function AdminAuditPage() {
  const [eventType, setEventType] = useState<string>("");
  const [serverSlug, setServerSlug] = useState("");
  const [limit, setLimit] = useState(50);

  const {
    data: resp,
    isLoading,
    refetch,
    isFetching,
  } = useListAuditLogsV1AuditGet({
    event_type:
      (eventType as (typeof AuditEventType)[keyof typeof AuditEventType]) || undefined,
    server_slug: serverSlug || undefined,
    limit,
  });

  const logs = (resp?.data ?? []) as AuditLogView[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Audit Logs
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Immutable platform-wide event log
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
            style={selectStyle}
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
            className="px-3 py-2 text-sm rounded-xl border outline-none min-w-[180px]"
            style={selectStyle}
          />

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 text-sm rounded-xl border outline-none"
            style={selectStyle}
          >
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
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
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--pc-elevated)" }}
            >
              <ClipboardList
                className="w-5 h-5"
                strokeWidth={1.5}
                style={{ color: "var(--pc-muted)" }}
              />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              No audit events
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              {eventType || serverSlug
                ? "Try adjusting your filters"
                : "Events will appear as traffic flows through the gateway"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--pc-elevated)" }}>
                <tr>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Outcome
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Event
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Server
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Tool
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Subject
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    IP
                  </th>
                  <th
                    className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const cfg = outcomeConfig(log.outcome);
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={log.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--pc-border)" }}
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
