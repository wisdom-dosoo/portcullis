"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  User,
  Server,
  Layers,
  GitBranch,
  FileText,
  Edit2,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  Info,
} from "lucide-react";

/* ── types ───────────────────────────────────────────────────────────────── */

type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type IncidentSeverity = "critical" | "high" | "medium" | "low";

interface TimelineEntry {
  id: string;
  time: string;
  author: string;
  type: "status_change" | "note" | "alert" | "action";
  content: string;
  from?: IncidentStatus;
  to?: IncidentStatus;
}

interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startTime: string;
  resolvedAt: string | null;
  affectedServices: string[];
  assignees: string[];
  relatedAlertRules: string[];
  relatedTraceIds: string[];
  rootCause: string;
  resolution: string;
  postmortemLink: string;
  summary: string;
  timeline: TimelineEntry[];
}

/* ── config ──────────────────────────────────────────────────────────────── */

const SEVERITY_CONFIG: Record<IncidentSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  high:     { label: "High",     color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  medium:   { label: "Medium",   color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)" },
  low:      { label: "Low",      color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.12)" },
};

const STATUS_CONFIG: Record<
  IncidentStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  investigating: {
    label: "Investigating",
    color: "var(--pc-critical)",
    bg: "rgba(240,93,94,0.12)",
    icon: <AlertTriangle size={13} />,
  },
  identified: {
    label: "Identified",
    color: "var(--pc-warning)",
    bg: "rgba(244,185,66,0.12)",
    icon: <Info size={13} />,
  },
  monitoring: {
    label: "Monitoring",
    color: "var(--pc-secondary)",
    bg: "rgba(72,184,232,0.12)",
    icon: <Clock size={13} />,
  },
  resolved: {
    label: "Resolved",
    color: "var(--pc-success)",
    bg: "rgba(53,200,138,0.12)",
    icon: <CheckCircle2 size={13} />,
  },
};

const TIMELINE_TYPE_CONFIG = {
  status_change: { color: "var(--pc-primary)",   dot: "var(--pc-primary)" },
  note:          { color: "var(--pc-foreground)", dot: "var(--pc-muted)" },
  alert:         { color: "var(--pc-critical)",   dot: "var(--pc-critical)" },
  action:        { color: "var(--pc-secondary)",  dot: "var(--pc-secondary)" },
};

/* ── demo data ───────────────────────────────────────────────────────────── */

const INCIDENTS: Record<string, Incident> = {
  "inc-001": {
    id: "inc-001",
    title: "Staging MCP server health check failing",
    severity: "critical",
    status: "investigating",
    startTime: new Date(Date.now() - 1_200_000).toISOString(),
    resolvedAt: null,
    affectedServices: ["staging-mcp"],
    assignees: ["oncall@example.com"],
    relatedAlertRules: ["Server health check"],
    relatedTraceIds: ["req-srv-health-001", "req-srv-health-002"],
    rootCause: "",
    resolution: "",
    postmortemLink: "",
    summary:
      "The staging-mcp server began failing consecutive health checks approximately 20 minutes ago. The upstream service is returning 503 on the health check endpoint. Downstream clients are receiving connection errors.",
    timeline: [
      {
        id: "t1",
        time: new Date(Date.now() - 1_200_000).toISOString(),
        author: "Alert system",
        type: "alert",
        content: 'Alert "Server health check" fired — staging-mcp unhealthy for > 2 min.',
      },
      {
        id: "t2",
        time: new Date(Date.now() - 1_140_000).toISOString(),
        author: "Alert system",
        type: "status_change",
        content: "Incident created automatically from alert rule.",
        from: undefined,
        to: "investigating",
      },
      {
        id: "t3",
        time: new Date(Date.now() - 1_080_000).toISOString(),
        author: "oncall@example.com",
        type: "note",
        content: "Acknowledged. Checking upstream service logs now.",
      },
    ],
  },
  "inc-002": {
    id: "inc-002",
    title: "Auth failure burst — possible credential leak",
    severity: "high",
    status: "identified",
    startTime: new Date(Date.now() - 3_600_000).toISOString(),
    resolvedAt: null,
    affectedServices: ["gateway"],
    assignees: ["security@example.com", "oncall@example.com"],
    relatedAlertRules: ["Auth failure burst"],
    relatedTraceIds: ["req-auth-001", "req-auth-002", "req-auth-003"],
    rootCause:
      "A CI/CD pipeline key was accidentally committed to a public GitHub repository. The key was discovered and is being used by external actors to probe the gateway.",
    resolution: "",
    postmortemLink: "",
    summary:
      "Between 15:00 and 15:05 UTC, the gateway received 47 authentication failures originating from 3 distinct IPs not seen in prior activity. Key isolation indicates the affected credential is the ci-pipeline-key.",
    timeline: [
      {
        id: "t1",
        time: new Date(Date.now() - 3_600_000).toISOString(),
        author: "Alert system",
        type: "alert",
        content: 'Alert "Auth failure burst" fired — 47 failures in 5 min.',
      },
      {
        id: "t2",
        time: new Date(Date.now() - 3_540_000).toISOString(),
        author: "Alert system",
        type: "status_change",
        content: "Incident created automatically.",
        to: "investigating",
      },
      {
        id: "t3",
        time: new Date(Date.now() - 3_300_000).toISOString(),
        author: "security@example.com",
        type: "action",
        content: "Revoked ci-pipeline-key. Failures dropped to zero immediately.",
      },
      {
        id: "t4",
        time: new Date(Date.now() - 3_100_000).toISOString(),
        author: "security@example.com",
        type: "status_change",
        content: "Root cause identified — leaked key in public repo.",
        from: "investigating",
        to: "identified",
      },
      {
        id: "t5",
        time: new Date(Date.now() - 2_900_000).toISOString(),
        author: "security@example.com",
        type: "note",
        content: "Rotated key and updated GitHub Actions secrets. Monitoring for further activity.",
      },
    ],
  },
  "inc-003": {
    id: "inc-003",
    title: "Production error rate spike",
    severity: "critical",
    status: "resolved",
    startTime: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    resolvedAt: new Date(Date.now() - 86_400_000 * 2 + 7_200_000).toISOString(),
    affectedServices: ["production-mcp"],
    assignees: ["oncall@example.com"],
    relatedAlertRules: ["Production error rate"],
    relatedTraceIds: ["req-prod-001", "req-prod-002"],
    rootCause:
      "A deployment of production-mcp v2.3.1 introduced a regression in the search_documents tool — the upstream Elasticsearch query timeout was set to 0ms, causing all search calls to fail immediately.",
    resolution:
      "Rolled back production-mcp to v2.3.0. Error rate returned to baseline within 3 minutes of rollback. A hotfix (v2.3.2) was deployed 90 minutes later with the correct timeout value.",
    postmortemLink: "https://docs.example.com/postmortems/2026-08-03-error-spike",
    summary:
      "Error rate on production-mcp rose from 0.2% to 38% starting at 14:12 UTC. The spike coincided with a deployment that completed at 14:11 UTC.",
    timeline: [
      {
        id: "t1",
        time: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        author: "Alert system",
        type: "alert",
        content: 'Alert "Production error rate" fired — 38% errors in 5 min.',
      },
      {
        id: "t2",
        time: new Date(Date.now() - 86_400_000 * 2 + 120_000).toISOString(),
        author: "Alert system",
        type: "status_change",
        content: "Incident created.",
        to: "investigating",
      },
      {
        id: "t3",
        time: new Date(Date.now() - 86_400_000 * 2 + 600_000).toISOString(),
        author: "oncall@example.com",
        type: "note",
        content: "Correlated with 14:11 deployment. Initiating rollback.",
      },
      {
        id: "t4",
        time: new Date(Date.now() - 86_400_000 * 2 + 900_000).toISOString(),
        author: "oncall@example.com",
        type: "status_change",
        content: "Rollback complete. Error rate normalizing.",
        from: "investigating",
        to: "monitoring",
      },
      {
        id: "t5",
        time: new Date(Date.now() - 86_400_000 * 2 + 7_200_000).toISOString(),
        author: "oncall@example.com",
        type: "status_change",
        content: "Error rate stable at baseline for 1 hour. Incident resolved.",
        from: "monitoring",
        to: "resolved",
      },
    ],
  },
  "inc-004": {
    id: "inc-004",
    title: "RBAC deny rate elevated — Developer role scope issue",
    severity: "high",
    status: "resolved",
    startTime: new Date(Date.now() - 86_400_000 * 5).toISOString(),
    resolvedAt: new Date(Date.now() - 86_400_000 * 5 + 3_600_000).toISOString(),
    affectedServices: ["production-mcp", "staging-mcp"],
    assignees: ["oncall@example.com"],
    relatedAlertRules: ["RBAC deny rate"],
    relatedTraceIds: [],
    rootCause:
      "A policy update to the Developer role inadvertently removed the tool_call:read permission for the search_* pattern, causing all Developer-scoped keys to receive deny responses for search tools.",
    resolution:
      "Restored the search_* allow rule on the Developer role. Deny rate dropped to zero within 2 minutes.",
    postmortemLink: "",
    summary:
      "RBAC deny events spiked to 120/min across production and staging servers. All denies targeted search-related tools and were limited to Developer-scoped API keys.",
    timeline: [
      {
        id: "t1",
        time: new Date(Date.now() - 86_400_000 * 5).toISOString(),
        author: "Alert system",
        type: "alert",
        content: 'Alert "RBAC deny rate" fired — 120 denies/min.',
      },
      {
        id: "t2",
        time: new Date(Date.now() - 86_400_000 * 5 + 180_000).toISOString(),
        author: "Alert system",
        type: "status_change",
        content: "Incident created.",
        to: "investigating",
      },
      {
        id: "t3",
        time: new Date(Date.now() - 86_400_000 * 5 + 1_200_000).toISOString(),
        author: "oncall@example.com",
        type: "note",
        content: "Isolated to Developer role. Checking recent policy changes.",
      },
      {
        id: "t4",
        time: new Date(Date.now() - 86_400_000 * 5 + 2_400_000).toISOString(),
        author: "oncall@example.com",
        type: "action",
        content: "Restored search_* allow rule on Developer role. Deny rate back to zero.",
      },
      {
        id: "t5",
        time: new Date(Date.now() - 86_400_000 * 5 + 3_600_000).toISOString(),
        author: "oncall@example.com",
        type: "status_change",
        content: "Monitoring confirms deny rate at baseline. Resolved.",
        from: "monitoring",
        to: "resolved",
      },
    ],
  },
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/* ── status transition ───────────────────────────────────────────────────── */

const STATUS_ORDER: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

function nextStatus(current: IncidentStatus): IncidentStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
}

/* ── timeline entry ──────────────────────────────────────────────────────── */

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const cfg = TIMELINE_TYPE_CONFIG[entry.type];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* dot + line */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
          paddingTop: 3,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: cfg.dot,
            flexShrink: 0,
          }}
        />
      </div>

      {/* content */}
      <div style={{ flex: 1, paddingBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-muted)" }}>
            {entry.author}
          </span>
          <span style={{ fontSize: 10, color: "var(--pc-muted)" }}>
            {fmtDate(entry.time)}
          </span>
          {entry.type === "status_change" && entry.to && (
            <span
              style={{
                padding: "1px 7px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
                background: STATUS_CONFIG[entry.to].bg,
                color: STATUS_CONFIG[entry.to].color,
              }}
            >
              → {STATUS_CONFIG[entry.to].label}
            </span>
          )}
          {entry.type === "alert" && (
            <span
              style={{
                padding: "1px 7px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
                background: "rgba(240,93,94,0.12)",
                color: "var(--pc-critical)",
              }}
            >
              Alert
            </span>
          )}
          {entry.type === "action" && (
            <span
              style={{
                padding: "1px 7px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
                background: "rgba(72,184,232,0.12)",
                color: "var(--pc-secondary)",
              }}
            >
              Action
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-foreground)", margin: 0, lineHeight: 1.5 }}>
          {entry.content}
        </p>
      </div>
    </div>
  );
}

/* ── section wrapper ─────────────────────────────────────────────────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--pc-border)",
          background: "var(--pc-elevated)",
        }}
      >
        <span style={{ color: "var(--pc-muted)" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

/* ── status stepper ──────────────────────────────────────────────────────── */

function StatusStepper({
  current,
  onChange,
}: {
  current: IncidentStatus;
  onChange: (s: IncidentStatus) => void;
}) {
  const statuses: IncidentStatus[] = ["investigating", "identified", "monitoring", "resolved"];
  const currentIdx = statuses.indexOf(current);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {statuses.map((s, i) => {
        const cfg = STATUS_CONFIG[s];
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => onChange(s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                background: isActive ? cfg.bg : "transparent",
                border: `1px solid ${isActive ? cfg.color : isPast ? "var(--pc-border)" : "var(--pc-border)"}`,
                borderRadius: 6,
                color: isActive ? cfg.color : isPast ? "var(--pc-success)" : "var(--pc-muted)",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {isPast ? (
                <CheckCircle2 size={12} style={{ color: "var(--pc-success)" }} />
              ) : isActive ? (
                cfg.icon
              ) : (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--pc-border)",
                  }}
                />
              )}
              {cfg.label}
            </button>
            {i < statuses.length - 1 && (
              <ChevronRight size={12} style={{ color: "var(--pc-border)", margin: "0 2px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const base = INCIDENTS[id];

  const [incident, setIncident] = useState<Incident>(
    base ?? {
      id,
      title: "Unknown incident",
      severity: "medium",
      status: "investigating",
      startTime: new Date().toISOString(),
      resolvedAt: null,
      affectedServices: [],
      assignees: [],
      relatedAlertRules: [],
      relatedTraceIds: [],
      rootCause: "",
      resolution: "",
      postmortemLink: "",
      summary: "",
      timeline: [],
    },
  );

  const [noteText, setNoteText] = useState("");
  const [editingField, setEditingField] = useState<
    "rootCause" | "resolution" | "postmortemLink" | "summary" | null
  >(null);
  const [editDraft, setEditDraft] = useState("");
  const [showAssigneeInput, setShowAssigneeInput] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState("");

  const sevCfg = SEVERITY_CONFIG[incident.severity];
  const staCfg = STATUS_CONFIG[incident.status];

  function updateStatus(s: IncidentStatus) {
    const entry: TimelineEntry = {
      id: `t-${Date.now()}`,
      time: new Date().toISOString(),
      author: "You",
      type: "status_change",
      content: `Status updated to ${STATUS_CONFIG[s].label}.`,
      from: incident.status,
      to: s,
    };
    setIncident((prev) => ({
      ...prev,
      status: s,
      resolvedAt: s === "resolved" ? new Date().toISOString() : prev.resolvedAt,
      timeline: [...prev.timeline, entry],
    }));
  }

  function addNote() {
    if (!noteText.trim()) return;
    const entry: TimelineEntry = {
      id: `t-${Date.now()}`,
      time: new Date().toISOString(),
      author: "You",
      type: "note",
      content: noteText.trim(),
    };
    setIncident((prev) => ({
      ...prev,
      timeline: [...prev.timeline, entry],
    }));
    setNoteText("");
  }

  function saveField(field: "rootCause" | "resolution" | "postmortemLink" | "summary") {
    setIncident((prev) => ({ ...prev, [field]: editDraft }));
    setEditingField(null);
  }

  function addAssignee() {
    if (!assigneeDraft.trim()) return;
    setIncident((prev) => ({
      ...prev,
      assignees: [...prev.assignees, assigneeDraft.trim()],
    }));
    setAssigneeDraft("");
    setShowAssigneeInput(false);
  }

  function removeAssignee(email: string) {
    setIncident((prev) => ({
      ...prev,
      assignees: prev.assignees.filter((a) => a !== email),
    }));
  }

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "var(--pc-bg)",
        color: "var(--pc-foreground)",
      }}
    >
      {/* back */}
      <Link
        href="/dashboard/alerts/incidents"
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
        All incidents
      </Link>

      {/* incident header */}
      <div
        style={{
          padding: 20,
          background: "var(--pc-surface)",
          border: `1px solid ${incident.status === "resolved" ? "rgba(53,200,138,0.3)" : "var(--pc-border)"}`,
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        {/* title row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  background: sevCfg.bg,
                  color: sevCfg.color,
                }}
              >
                {sevCfg.label}
              </span>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  background: staCfg.bg,
                  color: staCfg.color,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {staCfg.icon}
                {staCfg.label}
              </span>
              <span
                style={{ fontSize: 11, color: "var(--pc-muted)", fontFamily: "monospace" }}
              >
                #{incident.id}
              </span>
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
              {incident.title}
            </h1>
          </div>
        </div>

        {/* meta grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 14,
            marginBottom: 16,
          }}
        >
          {[
            {
              label: "Started",
              value: fmtDate(incident.startTime),
            },
            {
              label: "Duration",
              value: duration(incident.startTime, incident.resolvedAt),
            },
            {
              label: "Resolved",
              value: incident.resolvedAt ? fmtDate(incident.resolvedAt) : "—",
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--pc-muted)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 13, color: "var(--pc-foreground)" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* status stepper */}
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--pc-muted)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            Status
          </div>
          <StatusStepper current={incident.status} onChange={updateStatus} />
        </div>
      </div>

      {/* two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* summary */}
          <Section title="Summary" icon={<FileText size={13} />}>
            {editingField === "summary" ? (
              <EditBlock
                value={editDraft}
                onChange={setEditDraft}
                onSave={() => saveField("summary")}
                onCancel={() => setEditingField(null)}
                multiline
              />
            ) : (
              <div style={{ position: "relative" }}>
                <p style={{ fontSize: 13, color: "var(--pc-foreground)", margin: 0, lineHeight: 1.6 }}>
                  {incident.summary || <span style={{ color: "var(--pc-muted)" }}>No summary yet.</span>}
                </p>
                <EditIcon onClick={() => { setEditDraft(incident.summary); setEditingField("summary"); }} />
              </div>
            )}
          </Section>

          {/* root cause */}
          <Section title="Root cause" icon={<GitBranch size={13} />}>
            {editingField === "rootCause" ? (
              <EditBlock
                value={editDraft}
                onChange={setEditDraft}
                onSave={() => saveField("rootCause")}
                onCancel={() => setEditingField(null)}
                multiline
              />
            ) : (
              <div style={{ position: "relative" }}>
                <p style={{ fontSize: 13, color: "var(--pc-foreground)", margin: 0, lineHeight: 1.6 }}>
                  {incident.rootCause || (
                    <span style={{ color: "var(--pc-muted)" }}>
                      Root cause not yet identified.
                    </span>
                  )}
                </p>
                <EditIcon onClick={() => { setEditDraft(incident.rootCause); setEditingField("rootCause"); }} />
              </div>
            )}
          </Section>

          {/* resolution */}
          <Section title="Resolution" icon={<CheckCircle2 size={13} />}>
            {editingField === "resolution" ? (
              <EditBlock
                value={editDraft}
                onChange={setEditDraft}
                onSave={() => saveField("resolution")}
                onCancel={() => setEditingField(null)}
                multiline
              />
            ) : (
              <div style={{ position: "relative" }}>
                <p style={{ fontSize: 13, color: "var(--pc-foreground)", margin: 0, lineHeight: 1.6 }}>
                  {incident.resolution || (
                    <span style={{ color: "var(--pc-muted)" }}>No resolution documented yet.</span>
                  )}
                </p>
                <EditIcon onClick={() => { setEditDraft(incident.resolution); setEditingField("resolution"); }} />
              </div>
            )}
          </Section>

          {/* postmortem */}
          <Section title="Postmortem" icon={<ExternalLink size={13} />}>
            {editingField === "postmortemLink" ? (
              <EditBlock
                value={editDraft}
                onChange={setEditDraft}
                onSave={() => saveField("postmortemLink")}
                onCancel={() => setEditingField(null)}
                placeholder="https://docs.example.com/postmortems/…"
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {incident.postmortemLink ? (
                  <a
                    href={incident.postmortemLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13,
                      color: "var(--pc-secondary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {incident.postmortemLink}
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>
                    No postmortem link yet.
                  </span>
                )}
                <EditIcon onClick={() => { setEditDraft(incident.postmortemLink); setEditingField("postmortemLink"); }} />
              </div>
            )}
          </Section>

          {/* timeline */}
          <Section title="Timeline" icon={<Clock size={13} />}>
            {/* existing entries */}
            <div
              style={{
                borderLeft: "2px solid var(--pc-border)",
                paddingLeft: 16,
                marginBottom: 16,
              }}
            >
              {incident.timeline.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--pc-muted)" }}>No entries yet.</p>
              ) : (
                incident.timeline.map((entry) => (
                  <TimelineItem key={entry.id} entry={entry} />
                ))
              )}
            </div>

            {/* add note */}
            <div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a timeline note…"
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  color: "var(--pc-foreground)",
                  fontSize: 13,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={addNote}
                style={{
                  marginTop: 8,
                  padding: "7px 16px",
                  background: "var(--pc-primary)",
                  border: "none",
                  borderRadius: 6,
                  color: "#000",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add note
              </button>
            </div>
          </Section>
        </div>

        {/* right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* affected services */}
          <Section title="Affected services" icon={<Server size={13} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {incident.affectedServices.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>None listed</span>
              ) : (
                incident.affectedServices.map((s) => (
                  <div
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 12,
                      padding: "5px 8px",
                      background: "var(--pc-bg)",
                      borderRadius: 5,
                      border: "1px solid var(--pc-border)",
                    }}
                  >
                    <Server size={11} style={{ color: "var(--pc-muted)" }} />
                    {s}
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* assignees */}
          <Section title="Assigned responders" icon={<User size={13} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {incident.assignees.map((a) => (
                <div
                  key={a}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "5px 8px",
                    background: "var(--pc-bg)",
                    borderRadius: 5,
                    border: "1px solid var(--pc-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "var(--pc-elevated)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        color: "var(--pc-muted)",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {a[0].toUpperCase()}
                    </div>
                    <span style={{ color: "var(--pc-foreground)" }}>{a}</span>
                  </div>
                  <button
                    onClick={() => removeAssignee(a)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 2 }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}

              {showAssigneeInput ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); addAssignee(); }}
                  style={{ display: "flex", gap: 5 }}
                >
                  <input
                    autoFocus
                    value={assigneeDraft}
                    onChange={(e) => setAssigneeDraft(e.target.value)}
                    placeholder="email@example.com"
                    style={{
                      flex: 1,
                      padding: "5px 8px",
                      background: "var(--pc-elevated)",
                      border: "1px solid var(--pc-border)",
                      borderRadius: 5,
                      color: "var(--pc-foreground)",
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "5px 10px",
                      background: "var(--pc-primary)",
                      border: "none",
                      borderRadius: 5,
                      color: "#000",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowAssigneeInput(true)}
                  style={{
                    padding: "5px 8px",
                    background: "transparent",
                    border: "1px dashed var(--pc-border)",
                    borderRadius: 5,
                    color: "var(--pc-muted)",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Plus size={11} />
                  Add responder
                </button>
              )}
            </div>
          </Section>

          {/* related alerts */}
          <Section title="Related alerts" icon={<AlertTriangle size={13} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {incident.relatedAlertRules.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>None</span>
              ) : (
                incident.relatedAlertRules.map((r) => (
                  <div
                    key={r}
                    style={{
                      fontSize: 12,
                      padding: "5px 8px",
                      background: "var(--pc-bg)",
                      borderRadius: 5,
                      border: "1px solid var(--pc-border)",
                      color: "var(--pc-foreground)",
                    }}
                  >
                    {r}
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* related traces */}
          <Section title="Related traces" icon={<Layers size={13} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {incident.relatedTraceIds.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>None</span>
              ) : (
                incident.relatedTraceIds.map((t) => (
                  <Link
                    key={t}
                    href={`/dashboard/observability/traces?search=${encodeURIComponent(t)}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 11,
                      fontFamily: "monospace",
                      padding: "5px 8px",
                      background: "var(--pc-bg)",
                      borderRadius: 5,
                      border: "1px solid var(--pc-border)",
                      color: "var(--pc-secondary)",
                      textDecoration: "none",
                    }}
                  >
                    {t}
                    <ExternalLink size={10} />
                  </Link>
                ))
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ── small helpers ───────────────────────────────────────────────────────── */

function EditIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--pc-muted)",
        padding: 2,
      }}
    >
      <Edit2 size={12} />
    </button>
  );
}

function EditBlock({
  value,
  onChange,
  onSave,
  onCancel,
  multiline,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const baseStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 6,
    color: "var(--pc-foreground)",
    fontSize: 13,
    boxSizing: "border-box",
    lineHeight: 1.5,
  };

  return (
    <div>
      {multiline ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder={placeholder}
          style={{ ...baseStyle, resize: "vertical" }}
        />
      ) : (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={baseStyle}
        />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          onClick={onSave}
          style={{
            padding: "6px 14px",
            background: "var(--pc-primary)",
            border: "none",
            borderRadius: 5,
            color: "#000",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 14px",
            background: "transparent",
            border: "1px solid var(--pc-border)",
            borderRadius: 5,
            color: "var(--pc-muted)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
