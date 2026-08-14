"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  ArrowLeft,
  Plus,
} from "lucide-react";

/* ── types (duplicated from parent for isolation) ────────────────────────── */

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "critical" | "high" | "medium" | "low";

interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startTime: string;
  resolvedAt: string | null;
  affectedServices: string[];
  alertRuleId: string;
  assignee: string;
}

const SEVERITY_CONFIG: Record<IncidentSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  high:     { label: "High",     color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  medium:   { label: "Medium",   color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)" },
  low:      { label: "Low",      color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.12)" },
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; bg: string }> = {
  investigating: { label: "Investigating", color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  identified:    { label: "Identified",    color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  monitoring:    { label: "Monitoring",    color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)" },
  resolved:      { label: "Resolved",      color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)" },
};

const INCIDENTS: Incident[] = [
  {
    id: "inc-001",
    title: "Staging MCP server health check failing",
    severity: "critical",
    status: "investigating",
    startTime: new Date(Date.now() - 1_200_000).toISOString(),
    resolvedAt: null,
    affectedServices: ["staging-mcp"],
    alertRuleId: "rule-2",
    assignee: "oncall@example.com",
  },
  {
    id: "inc-002",
    title: "Auth failure burst — possible credential leak",
    severity: "high",
    status: "identified",
    startTime: new Date(Date.now() - 3_600_000).toISOString(),
    resolvedAt: null,
    affectedServices: ["gateway"],
    alertRuleId: "rule-4",
    assignee: "security@example.com",
  },
  {
    id: "inc-003",
    title: "Production error rate spike",
    severity: "critical",
    status: "resolved",
    startTime: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    resolvedAt: new Date(Date.now() - 86_400_000 * 2 + 7_200_000).toISOString(),
    affectedServices: ["production-mcp"],
    alertRuleId: "rule-1",
    assignee: "oncall@example.com",
  },
  {
    id: "inc-004",
    title: "RBAC deny rate elevated — Developer role scope issue",
    severity: "high",
    status: "resolved",
    startTime: new Date(Date.now() - 86_400_000 * 5).toISOString(),
    resolvedAt: new Date(Date.now() - 86_400_000 * 5 + 3_600_000).toISOString(),
    affectedServices: ["production-mcp", "staging-mcp"],
    alertRuleId: "rule-3",
    assignee: "oncall@example.com",
  },
];

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function duration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export default function IncidentsPage() {
  const [filterStatus, setFilterStatus] = useState<"" | IncidentStatus>("");

  const filtered = filterStatus
    ? INCIDENTS.filter((i) => i.status === filterStatus)
    : INCIDENTS;

  const activeCount = INCIDENTS.filter((i) => i.status !== "resolved").length;
  const resolvedCount = INCIDENTS.filter((i) => i.status === "resolved").length;

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "var(--pc-bg)",
        color: "var(--pc-foreground)",
      }}
    >
      {/* back + header */}
      <Link
        href="/dashboard/alerts"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--pc-muted)",
          fontSize: 13,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} />
        Back to alerts
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <AlertTriangle size={20} style={{ color: "var(--pc-critical)" }} />
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Incidents</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
            Track, triage, and resolve active incidents.
          </p>
        </div>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: "var(--pc-critical)",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          Declare incident
        </button>
      </div>

      {/* summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Active",   value: activeCount,            color: "var(--pc-critical)", icon: <AlertTriangle size={15} /> },
          { label: "Resolved", value: resolvedCount,          color: "var(--pc-success)",  icon: <CheckCircle2 size={15} /> },
          { label: "Total",    value: INCIDENTS.length,       color: "var(--pc-muted)",    icon: <Clock size={15} /> },
        ].map(({ label, value, color, icon }) => (
          <div
            key={label}
            style={{
              padding: 14,
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                background: `${color}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["", "investigating", "identified", "monitoring", "resolved"] as const).map(
          (s) => {
            const cfg = s ? STATUS_CONFIG[s] : null;
            const label = cfg ? cfg.label : "All";
            const active = filterStatus === s;
            return (
              <button
                key={s || "all"}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${active && cfg ? cfg.color : "var(--pc-border)"}`,
                  background: active && cfg ? cfg.bg : "transparent",
                  color: active && cfg ? cfg.color : active ? "var(--pc-foreground)" : "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          },
        )}
      </div>

      {/* list */}
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
              {["Status", "Severity", "Title", "Started", "Duration", "Services", "Assignee", ""].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--pc-muted)",
                      textAlign: "left",
                      background: "var(--pc-elevated)",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((inc) => {
              const sev = SEVERITY_CONFIG[inc.severity];
              const sta = STATUS_CONFIG[inc.status];
              return (
                <tr
                  key={inc.id}
                  style={{ borderBottom: "1px solid var(--pc-border)", cursor: "pointer" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "var(--pc-elevated)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  <td style={{ padding: "11px 14px" }}>
                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        background: sta.bg,
                        color: sta.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sta.label}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        background: sev.bg,
                        color: sev.color,
                      }}
                    >
                      {sev.label}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, maxWidth: 280 }}>
                    <Link
                      href={`/dashboard/alerts/incidents/${inc.id}`}
                      style={{ color: "var(--pc-foreground)", textDecoration: "none" }}
                    >
                      {inc.title}
                    </Link>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 11, color: "var(--pc-muted)", whiteSpace: "nowrap" }}>
                    {relativeTime(inc.startTime)}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--pc-foreground)" }}>
                    {duration(inc.startTime, inc.resolvedAt)}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {inc.affectedServices.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "var(--pc-elevated)",
                            color: "var(--pc-muted)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 11, color: "var(--pc-muted)" }}>
                    {inc.assignee}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <Link href={`/dashboard/alerts/incidents/${inc.id}`}>
                      <ChevronRight size={14} style={{ color: "var(--pc-muted)" }} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
