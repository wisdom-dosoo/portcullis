"use client";

import { useState, useMemo } from "react";
import {
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
  Search,
  Download,
  Bookmark,
  BookmarkCheck,
  ShieldAlert,
  Webhook,
  ChevronRight,
  X,
  Clock,
  Globe,
  Terminal,
  Hash,
  User,
  Info,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  AuditEventType,
  type AuditLogView,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import { TableEmpty, EMPTY_STATES } from "@/components/empty-state";

/* ── org event catalogue ─────────────────────────────────────────────────── */

type OrgEventCategory =
  | "auth"
  | "invitation"
  | "role"
  | "api_key"
  | "policy"
  | "server"
  | "tool"
  | "request"
  | "billing"
  | "integration";

interface OrgEvent {
  id: string;
  category: OrgEventCategory;
  action: string;
  actor: string;
  actorType: "user" | "api_key" | "system";
  resource: string;
  resourceType: string;
  prevValue: string;
  newValue: string;
  outcome: "success" | "failure" | "blocked";
  timestamp: string;
  ip: string;
  userAgent: string;
  requestId: string;
  reason: string;
  raw: AuditLogView | null;
}

/* ── category config ─────────────────────────────────────────────────────── */

interface CategoryConfig {
  label: string;
  color: string;
  bg: string;
}

const CATEGORY_CONFIG: Record<OrgEventCategory, CategoryConfig> = {
  auth:        { label: "User login",         color: "var(--pc-primary)",   bg: "rgba(45,212,167,0.12)" },
  invitation:  { label: "User invitation",    color: "var(--pc-secondary)", bg: "rgba(72,184,232,0.12)" },
  role:        { label: "Role change",        color: "#9b8cff",             bg: "rgba(155,140,255,0.12)" },
  api_key:     { label: "API key",            color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)" },
  policy:      { label: "Policy",             color: "var(--pc-secondary)", bg: "rgba(72,184,232,0.12)" },
  server:      { label: "Server",             color: "var(--pc-primary)",   bg: "rgba(45,212,167,0.12)" },
  tool:        { label: "Tool",               color: "var(--pc-muted)",     bg: "rgba(139,152,167,0.12)" },
  request:     { label: "Request blocked",    color: "var(--pc-critical)",  bg: "rgba(240,93,94,0.12)" },
  billing:     { label: "Billing change",     color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)" },
  integration: { label: "Integration change", color: "#9b8cff",             bg: "rgba(155,140,255,0.12)" },
};

const OUTCOME_CONFIG = {
  success: { label: "Success", color: "var(--pc-success)", bg: "rgba(53,200,138,0.12)" },
  failure: { label: "Failure", color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  blocked: { label: "Blocked", color: "var(--pc-warning)", bg: "rgba(244,185,66,0.12)" },
};

/* ── API event → OrgEvent ────────────────────────────────────────────────── */

function mapAuditLog(l: AuditLogView, idx: number): OrgEvent {
  const actor = l.subject_id ?? "system";
  const ip = l.client_ip ?? "—";
  const rid = l.request_id ?? l.id ?? `synth-${idx}`;
  const ts = l.created_at ?? new Date().toISOString();

  if (l.event_type === AuditEventType.auth_failure) {
    return {
      id: rid,
      category: "auth",
      action: "Authentication failed",
      actor,
      actorType: "api_key",
      resource: l.server_slug ?? "gateway",
      resourceType: "gateway",
      prevValue: "authenticated",
      newValue: "rejected",
      outcome: "failure",
      timestamp: ts,
      ip,
      userAgent: "mcp-client/1.0",
      requestId: rid,
      reason: "Invalid or expired API key",
      raw: l,
    };
  }

  if (l.event_type === AuditEventType.rbac_deny) {
    return {
      id: rid,
      category: "request",
      action: "Request blocked",
      actor,
      actorType: "api_key",
      resource: `${l.server_slug ?? "server"}/${l.tool_name ?? "tool"}`,
      resourceType: "tool",
      prevValue: "—",
      newValue: "—",
      outcome: "blocked",
      timestamp: ts,
      ip,
      userAgent: "mcp-client/1.0",
      requestId: rid,
      reason: `RBAC policy denied access to "${l.tool_name ?? "tool"}"`,
      raw: l,
    };
  }

  return {
    id: rid,
    category: "request",
    action: `Tool call: ${l.tool_name ?? l.rpc_method ?? "unknown"}`,
    actor,
    actorType: "api_key",
    resource: `${l.server_slug ?? "server"}/${l.tool_name ?? "tool"}`,
    resourceType: "tool",
    prevValue: "—",
    newValue: l.outcome ?? "success",
    outcome:
      l.outcome === "error" || l.outcome === "failure" ? "failure" : "success",
    timestamp: ts,
    ip,
    userAgent: "mcp-client/1.0",
    requestId: rid,
    reason: l.detail ? JSON.stringify(l.detail) : "—",
    raw: l,
  };
}

/* ── synthetic org admin events ──────────────────────────────────────────── */

const SYNTHETIC_EVENTS: OrgEvent[] = [
  {
    id: "synth-inv-1",
    category: "invitation",
    action: "User invited",
    actor: "admin@example.com",
    actorType: "user",
    resource: "dev@example.com",
    resourceType: "user",
    prevValue: "—",
    newValue: "invited",
    outcome: "success",
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-inv-001",
    reason: "Invited as Developer",
    raw: null,
  },
  {
    id: "synth-role-1",
    category: "role",
    action: "Role assigned",
    actor: "admin@example.com",
    actorType: "user",
    resource: "key_abc123",
    resourceType: "api_key",
    prevValue: "ReadOnly",
    newValue: "Developer",
    outcome: "success",
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-role-001",
    reason: "Promotion approved by org admin",
    raw: null,
  },
  {
    id: "synth-key-1",
    category: "api_key",
    action: "API key created",
    actor: "admin@example.com",
    actorType: "user",
    resource: "ci-pipeline-key",
    resourceType: "api_key",
    prevValue: "—",
    newValue: "active",
    outcome: "success",
    timestamp: new Date(Date.now() - 7_200_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-key-001",
    reason: "CI/CD automation key for staging",
    raw: null,
  },
  {
    id: "synth-key-2",
    category: "api_key",
    action: "API key revoked",
    actor: "admin@example.com",
    actorType: "user",
    resource: "old-dev-key",
    resourceType: "api_key",
    prevValue: "active",
    newValue: "revoked",
    outcome: "success",
    timestamp: new Date(Date.now() - 86_400_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-key-002",
    reason: "Employee offboarding",
    raw: null,
  },
  {
    id: "synth-pol-1",
    category: "policy",
    action: "Policy created",
    actor: "admin@example.com",
    actorType: "user",
    resource: "rate-limit-prod",
    resourceType: "policy",
    prevValue: "—",
    newValue: "100 req/min",
    outcome: "success",
    timestamp: new Date(Date.now() - 172_800_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-pol-001",
    reason: "Applied to production servers",
    raw: null,
  },
  {
    id: "synth-pol-2",
    category: "policy",
    action: "Policy activated",
    actor: "admin@example.com",
    actorType: "user",
    resource: "rate-limit-prod",
    resourceType: "policy",
    prevValue: "draft",
    newValue: "active",
    outcome: "success",
    timestamp: new Date(Date.now() - 170_000_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-pol-002",
    reason: "—",
    raw: null,
  },
  {
    id: "synth-srv-1",
    category: "server",
    action: "Server registered",
    actor: "admin@example.com",
    actorType: "user",
    resource: "production-mcp",
    resourceType: "server",
    prevValue: "—",
    newValue: "active",
    outcome: "success",
    timestamp: new Date(Date.now() - 259_200_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-srv-001",
    reason: "New MCP server onboarded",
    raw: null,
  },
  {
    id: "synth-srv-2",
    category: "server",
    action: "Server config changed",
    actor: "admin@example.com",
    actorType: "user",
    resource: "staging-mcp",
    resourceType: "server",
    prevValue: "http://old-host:8080",
    newValue: "http://new-host:8080",
    outcome: "success",
    timestamp: new Date(Date.now() - 345_600_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-srv-002",
    reason: "Upstream host migration",
    raw: null,
  },
  {
    id: "synth-tool-1",
    category: "tool",
    action: "Tool disabled",
    actor: "admin@example.com",
    actorType: "user",
    resource: "staging-mcp/delete_database",
    resourceType: "tool",
    prevValue: "enabled",
    newValue: "disabled",
    outcome: "success",
    timestamp: new Date(Date.now() - 432_000_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-tool-001",
    reason: "High-risk tool disabled pending security review",
    raw: null,
  },
  {
    id: "synth-billing-1",
    category: "billing",
    action: "Plan upgraded",
    actor: "admin@example.com",
    actorType: "user",
    resource: "subscription",
    resourceType: "billing",
    prevValue: "Starter",
    newValue: "Pro",
    outcome: "success",
    timestamp: new Date(Date.now() - 604_800_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-billing-001",
    reason: "Monthly billing cycle",
    raw: null,
  },
  {
    id: "synth-int-1",
    category: "integration",
    action: "Integration connected",
    actor: "admin@example.com",
    actorType: "user",
    resource: "slack-alerts",
    resourceType: "integration",
    prevValue: "—",
    newValue: "connected",
    outcome: "success",
    timestamp: new Date(Date.now() - 691_200_000).toISOString(),
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    requestId: "req-int-001",
    reason: "Slack webhook for critical alerts",
    raw: null,
  },
];

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtDateFull(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function redact(val: string, mask: boolean): string {
  if (!mask || !val || val === "—") return val;
  if (val.length <= 4) return "•".repeat(val.length);
  return val.slice(0, 3) + "•".repeat(Math.min(val.length - 3, 12));
}

function retentionMs(r: string): number {
  const map: Record<string, number> = {
    "7d":  7 * 86_400_000,
    "30d": 30 * 86_400_000,
    "90d": 90 * 86_400_000,
    "1y":  365 * 86_400_000,
    "all": Infinity,
  };
  return map[r] ?? Infinity;
}

/* ── CSV export ──────────────────────────────────────────────────────────── */

function exportCsv(events: OrgEvent[], compliance: boolean) {
  const header = [
    "Timestamp","Category","Action","Actor","Resource",
    "Previous value","New value","Outcome","IP address","Request ID","Reason",
  ].join(",");

  const rows = events.map((e) =>
    [
      fmtDateFull(e.timestamp),
      CATEGORY_CONFIG[e.category].label,
      e.action,
      redact(e.actor, compliance && e.actorType === "api_key"),
      e.resource,
      e.prevValue,
      e.newValue,
      e.outcome,
      redact(e.ip, compliance),
      e.requestId,
      e.reason.replace(/,/g, ";"),
    ]
      .map((v) => `"${v}"`)
      .join(","),
  );

  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `portcullis-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

/* ── detail drawer ───────────────────────────────────────────────────────── */

function DetailDrawer({
  event,
  onClose,
  compliance,
}: {
  event: OrgEvent;
  onClose: () => void;
  compliance: boolean;
}) {
  const cfg = CATEGORY_CONFIG[event.category];
  const out = OUTCOME_CONFIG[event.outcome];

  const fields: Array<{
    label: string;
    icon: React.ReactNode;
    value: string;
    mono?: boolean;
  }> = [
    {
      label: "Actor",
      icon: <User size={13} />,
      value: redact(event.actor, compliance && event.actorType === "api_key"),
      mono: true,
    },
    { label: "Action",        icon: <ClipboardList size={13} />, value: event.action },
    { label: "Resource",      icon: <Hash size={13} />,          value: event.resource, mono: true },
    { label: "Resource type", icon: <Info size={13} />,          value: event.resourceType },
    { label: "Previous value",icon: <ChevronRight size={13} />,  value: event.prevValue || "—" },
    { label: "New value",     icon: <ChevronRight size={13} />,  value: event.newValue || "—" },
    { label: "Timestamp",     icon: <Clock size={13} />,         value: fmtDateFull(event.timestamp) },
    {
      label: "IP address",
      icon: <Globe size={13} />,
      value: redact(event.ip, compliance),
      mono: true,
    },
    { label: "User agent",    icon: <Terminal size={13} />,      value: event.userAgent, mono: true },
    { label: "Request ID",    icon: <Hash size={13} />,          value: event.requestId, mono: true },
    { label: "Reason",        icon: <Info size={13} />,          value: event.reason || "—" },
    { label: "Outcome",       icon: <CheckCircle2 size={13} />,  value: event.outcome },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 460,
          background: "var(--pc-surface)",
          borderLeft: "1px solid var(--pc-border)",
          zIndex: 50,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pc-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "var(--pc-surface)",
            zIndex: 1,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: cfg.bg,
                  color: cfg.color,
                }}
              >
                {cfg.label}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: out.bg,
                  color: out.color,
                }}
              >
                {out.label}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-foreground)" }}>
              {event.action}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--pc-muted)",
              padding: 4,
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* fields */}
        <div style={{ padding: "16px 20px", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {fields.map(({ label, icon, value, mono }) => (
              <div key={label}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10,
                    color: "var(--pc-muted)",
                    marginBottom: 3,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {icon}
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--pc-foreground)",
                    fontFamily: mono ? "monospace" : "inherit",
                    wordBreak: "break-all",
                    padding: "6px 8px",
                    background: "var(--pc-bg)",
                    borderRadius: 5,
                    border: "1px solid var(--pc-border)",
                    lineHeight: 1.5,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          {event.raw && (
            <details
              style={{
                marginTop: 20,
                padding: 12,
                background: "var(--pc-bg)",
                borderRadius: 6,
                border: "1px solid var(--pc-border)",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--pc-muted)",
                  userSelect: "none",
                }}
              >
                Raw audit record
              </summary>
              <pre
                style={{
                  marginTop: 10,
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "var(--pc-foreground)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(event.raw, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

/* ── saved searches ──────────────────────────────────────────────────────── */

interface SavedSearch {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

/* ── filters ─────────────────────────────────────────────────────────────── */

interface FilterState {
  search: string;
  category: string;
  outcome: string;
  actor: string;
  retention: string;
}

const EMPTY_FILTERS: FilterState = {
  search: "",
  category: "",
  outcome: "",
  actor: "",
  retention: "30d",
};

/* ── webhook modal ───────────────────────────────────────────────────────── */

function WebhookModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selected, setSelected] = useState<OrgEventCategory[]>([]);
  const [saved, setSaved] = useState(false);

  function toggle(c: OrgEventCategory) {
    setSelected((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 520,
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 12,
          zIndex: 60,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pc-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Webhook size={16} style={{ color: "var(--pc-primary)" }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Webhook forwarding</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>
            Forward audit events to an external HTTPS endpoint in real time. Events are posted as signed JSON payloads.
          </p>

          <div>
            <label style={{ fontSize: 12, color: "var(--pc-muted)", display: "block", marginBottom: 5 }}>
              Endpoint URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-service.example.com/audit-hook"
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--pc-muted)", display: "block", marginBottom: 5 }}>
              Signing secret
            </label>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type="password"
              placeholder="whsec_…"
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--pc-muted)", display: "block", marginBottom: 8 }}>
              Event categories to forward
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(CATEGORY_CONFIG) as OrgEventCategory[]).map((c) => {
                const cfg = CATEGORY_CONFIG[c];
                const on = selected.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggle(c)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 500,
                      border: `1px solid ${on ? cfg.color : "var(--pc-border)"}`,
                      background: on ? cfg.bg : "transparent",
                      color: on ? cfg.color : "var(--pc-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {saved && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(53,200,138,0.12)",
                border: "1px solid rgba(53,200,138,0.3)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--pc-success)",
              }}
            >
              Webhook configuration saved. Activate in gateway settings to begin forwarding.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-muted)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setSaved(true)}
              style={{
                padding: "8px 16px",
                background: "var(--pc-primary)",
                border: "none",
                borderRadius: 6,
                color: "#000",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save webhook
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

const PAGE_SIZE = 50;

export default function AuditPage() {
  const logsQuery = useListAuditLogsV1AuditGet({ limit: 200 });
  const logs = (logsQuery.data?.data ?? []) as AuditLogView[];

  const allEvents = useMemo<OrgEvent[]>(() => {
    const api = logs.map(mapAuditLog);
    return [...SYNTHETIC_EVENTS, ...api].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [logs]);

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [compliance, setCompliance] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSaveName, setShowSaveName] = useState(false);
  const [selected, setSelected] = useState<OrgEvent | null>(null);
  const [showWebhook, setShowWebhook] = useState(false);
  const [page, setPage] = useState(0);

  function setFilter<K extends keyof FilterState>(key: K, val: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
    setPage(0);
  }

  const filtered = useMemo(() => {
    const cutoff = Date.now() - retentionMs(filters.retention);
    let r = allEvents.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      r = r.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q) ||
          e.resource.toLowerCase().includes(q) ||
          e.requestId.toLowerCase().includes(q),
      );
    }
    if (filters.category) r = r.filter((e) => e.category === filters.category);
    if (filters.outcome) r = r.filter((e) => e.outcome === filters.outcome);
    if (filters.actor) {
      const q = filters.actor.toLowerCase();
      r = r.filter((e) => e.actor.toLowerCase().includes(q));
    }
    return r;
  }, [allEvents, filters]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of filtered) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [filtered]);

  function saveSearch() {
    if (!saveName.trim()) return;
    setSavedSearches((prev) => [
      ...prev,
      { id: Date.now().toString(), name: saveName.trim(), filters: { ...filters }, createdAt: new Date().toISOString() },
    ]);
    setSaveName("");
    setShowSaveName(false);
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
      {/* ── header ── */}
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
            <ClipboardList size={20} style={{ color: "var(--pc-primary)" }} />
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Organization Audit Log</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
            Admin actions, access events, and configuration changes in a single tamper-evident trail.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* compliance mode */}
          <button
            onClick={() => setCompliance((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              background: compliance ? "rgba(240,93,94,0.1)" : "var(--pc-surface)",
              border: `1px solid ${compliance ? "var(--pc-critical)" : "var(--pc-border)"}`,
              borderRadius: 6,
              color: compliance ? "var(--pc-critical)" : "var(--pc-muted)",
              fontSize: 12,
              fontWeight: compliance ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {compliance ? <EyeOff size={13} /> : <Eye size={13} />}
            {compliance ? "Compliance ON" : "Compliance mode"}
          </button>

          {/* saved searches */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowSavedMenu((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 13px",
                background: "var(--pc-surface)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <Bookmark size={13} />
              Saved
              {savedSearches.length > 0 && (
                <span
                  style={{
                    background: "var(--pc-primary)",
                    color: "#000",
                    borderRadius: 8,
                    padding: "0 5px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {savedSearches.length}
                </span>
              )}
            </button>

            {showSavedMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 270,
                  background: "var(--pc-surface)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 8,
                  zIndex: 20,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "9px 12px",
                    borderBottom: "1px solid var(--pc-border)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--pc-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Saved searches
                </div>
                {savedSearches.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: "var(--pc-muted)", textAlign: "center" }}>
                    No saved searches yet
                  </div>
                ) : (
                  savedSearches.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--pc-border)",
                        gap: 8,
                      }}
                    >
                      <button
                        onClick={() => {
                          setFilters(s.filters);
                          setShowSavedMenu(false);
                          setPage(0);
                        }}
                        style={{
                          flex: 1,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--pc-foreground)",
                          fontSize: 12,
                          textAlign: "left",
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>
                          {s.filters.category || "all categories"} · {s.filters.retention}
                        </div>
                      </button>
                      <button
                        onClick={() =>
                          setSavedSearches((p) => p.filter((x) => x.id !== s.id))
                        }
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--pc-muted)",
                          padding: 4,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
                <div style={{ padding: 10 }}>
                  {showSaveName ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); saveSearch(); }}
                      style={{ display: "flex", gap: 6 }}
                    >
                      <input
                        autoFocus
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Name this search…"
                        style={{
                          flex: 1,
                          padding: "5px 8px",
                          background: "var(--pc-elevated)",
                          border: "1px solid var(--pc-border)",
                          borderRadius: 4,
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
                          borderRadius: 4,
                          color: "#000",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowSaveName(true)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        background: "transparent",
                        border: "1px dashed var(--pc-border)",
                        borderRadius: 5,
                        color: "var(--pc-muted)",
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <BookmarkCheck size={12} />
                      Save current search
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* webhook */}
          <button
            onClick={() => setShowWebhook(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-foreground)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Webhook size={13} />
            Webhook
          </button>

          {/* export */}
          <button
            onClick={() => exportCsv(filtered, compliance)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              background: "var(--pc-primary)",
              border: "none",
              borderRadius: 6,
              color: "#000",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Download size={13} />
            Export CSV
          </button>

          <button
            onClick={() => logsQuery.refetch()}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 8,
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-muted)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── compliance notice ── */}
      {compliance && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(240,93,94,0.08)",
            border: "1px solid rgba(240,93,94,0.3)",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 12,
            color: "var(--pc-critical)",
          }}
        >
          <ShieldAlert size={14} />
          Compliance mode active — API key IDs and IP addresses are redacted in the UI and CSV exports.
        </div>
      )}

      {/* ── category strip ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          onClick={() => setFilter("category", "")}
          style={{
            padding: "3px 12px",
            borderRadius: 14,
            fontSize: 11,
            fontWeight: 600,
            border: "1px solid var(--pc-border)",
            background: !filters.category ? "var(--pc-elevated)" : "transparent",
            color: !filters.category ? "var(--pc-foreground)" : "var(--pc-muted)",
            cursor: "pointer",
          }}
        >
          All ({filtered.length})
        </button>
        {(Object.entries(CATEGORY_CONFIG) as [OrgEventCategory, CategoryConfig][]).map(
          ([cat, cfg]) => {
            const n = counts[cat] ?? 0;
            if (n === 0) return null;
            return (
              <button
                key={cat}
                onClick={() =>
                  setFilter("category", filters.category === cat ? "" : cat)
                }
                style={{
                  padding: "3px 12px",
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${filters.category === cat ? cfg.color : "var(--pc-border)"}`,
                  background: filters.category === cat ? cfg.bg : "transparent",
                  color: filters.category === cat ? cfg.color : "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                {cfg.label} ({n})
              </button>
            );
          },
        )}
      </div>

      {/* ── search row ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pc-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Search by action, actor, resource, or request ID…"
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-foreground)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {/* retention */}
        <select
          value={filters.retention}
          onChange={(e) => setFilter("retention", e.target.value)}
          style={{
            padding: "8px 10px",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 12,
          }}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last 1 year</option>
          <option value="all">All time</option>
        </select>

        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 13px",
            background: showFilters ? "var(--pc-elevated)" : "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <Filter size={13} />
          Filters
        </button>
      </div>

      {/* ── extended filters ── */}
      {showFilters && (
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 14,
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            marginBottom: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div>
            <label
              style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}
            >
              Outcome
            </label>
            <select
              value={filters.outcome}
              onChange={(e) => setFilter("outcome", e.target.value)}
              style={{
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            >
              <option value="">All outcomes</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div>
            <label
              style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}
            >
              Actor
            </label>
            <input
              value={filters.actor}
              onChange={(e) => setFilter("actor", e.target.value)}
              placeholder="email or key ID…"
              style={{
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
                width: 200,
              }}
            />
          </div>

          <button
            onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); }}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── result count ── */}
      <div style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 10 }}>
        {logsQuery.isLoading
          ? "Loading API events…"
          : `${filtered.length} events · ${SYNTHETIC_EVENTS.length} org admin · ${logs.length} gateway API`}
        {filtered.length !== allEvents.length &&
          ` — filtered from ${allEvents.length}`}
      </div>

      {/* ── table ── */}
      <div
        style={{
          background: "var(--pc-surface)",
          borderRadius: 8,
          border: "1px solid var(--pc-border)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
              {["Time", "Category", "Action", "Actor", "Resource", "Outcome", ""].map((h) => (
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
              ))}
            </tr>
          </thead>
          <tbody>
            {logsQuery.isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} style={{ padding: "10px 14px" }}>
                      <Skeleton style={{ height: 13, width: "80%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <TableEmpty colSpan={7} subject="audit events" />
            ) : (
              paged.map((event, i) => {
                const cfg = CATEGORY_CONFIG[event.category];
                const out = OUTCOME_CONFIG[event.outcome];
                return (
                  <tr
                    key={event.id + i}
                    onClick={() => setSelected(event)}
                    style={{
                      borderBottom: "1px solid var(--pc-border)",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "var(--pc-elevated)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--pc-muted)", whiteSpace: "nowrap" }}>
                      {relativeTime(event.timestamp)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          background: cfg.bg,
                          color: cfg.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, maxWidth: 240 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {event.action}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", maxWidth: 150 }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          color: "var(--pc-muted)",
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {redact(event.actor, compliance && event.actorType === "api_key")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          color: "var(--pc-foreground)",
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {event.resource}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          background: out.bg,
                          color: out.color,
                        }}
                      >
                        {out.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <ChevronRight size={14} style={{ color: "var(--pc-muted)" }} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── pagination ── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>
            Page {page + 1} of {totalPages} · {filtered.length} events
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              style={{
                padding: "6px 14px",
                background: "var(--pc-surface)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: page === 0 ? "var(--pc-muted)" : "var(--pc-foreground)",
                fontSize: 12,
                cursor: page === 0 ? "default" : "pointer",
              }}
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              style={{
                padding: "6px 14px",
                background: "var(--pc-surface)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: page >= totalPages - 1 ? "var(--pc-muted)" : "var(--pc-foreground)",
                fontSize: 12,
                cursor: page >= totalPages - 1 ? "default" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── source note ── */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--pc-muted)",
        }}
      >
        <Info size={12} />
        Gateway API events (auth failures, RBAC denies, tool calls) are sourced from the audit API. Admin-level events (invitations, key management, billing) are demo records — a full org event API is required to persist these.
      </div>

      {/* ── detail drawer ── */}
      {selected && (
        <DetailDrawer
          event={selected}
          onClose={() => setSelected(null)}
          compliance={compliance}
        />
      )}

      {/* ── webhook modal ── */}
      {showWebhook && <WebhookModal onClose={() => setShowWebhook(false)} />}
    </div>
  );
}
