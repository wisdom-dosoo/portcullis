"use client";

import { useState, useMemo } from "react";
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Shield,
  Key,
  Gauge,
  GitBranch,
  LogIn,
  Wrench,
  X,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  Webhook,
  Phone,
  Monitor,
  Info,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  type AuditLogView,
  type ServerView,
  AuditEventType,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { EmptyState, FilterEmpty, EMPTY_STATES } from "@/components/empty-state";

/* ── types ───────────────────────────────────────────────────────────────── */

type AlertRuleType =
  | "high_error_rate"
  | "server_unavailable"
  | "latency_threshold"
  | "request_spike"
  | "policy_violation"
  | "api_key_abuse"
  | "quota_exceeded"
  | "circuit_breaker"
  | "suspicious_login"
  | "high_risk_tool";

type NotificationChannel =
  | "email"
  | "slack"
  | "teams"
  | "discord"
  | "webhook"
  | "pagerduty"
  | "in_app";

type AlertSeverity = "critical" | "high" | "medium" | "low";
type AlertStatus = "firing" | "ok" | "pending" | "silenced";

interface NotificationTarget {
  channel: NotificationChannel;
  destination: string; // email address, webhook URL, channel name, etc.
}

interface AlertRule {
  id: string;
  name: string;
  type: AlertRuleType;
  enabled: boolean;
  severity: AlertSeverity;
  status: AlertStatus;
  threshold: string;        // human-readable threshold description
  windowSeconds: number;
  serverPattern: string;    // "*" = all
  notifications: NotificationTarget[];
  lastFiredAt: string | null;
  firingCount: number;      // times fired in retention window
  description: string;
}

/* ── static config ───────────────────────────────────────────────────────── */

const RULE_TYPE_CONFIG: Record<
  AlertRuleType,
  { label: string; icon: React.ReactNode; defaultThreshold: string; description: string }
> = {
  high_error_rate:    { label: "High error rate",        icon: <XCircle size={14} />,       defaultThreshold: "> 5% errors over 5 min",       description: "Fires when the error rate across tool calls exceeds the configured threshold." },
  server_unavailable: { label: "Server unavailable",     icon: <AlertTriangle size={14} />, defaultThreshold: "unhealthy for > 2 min",         description: "Fires when a registered MCP server fails consecutive health checks." },
  latency_threshold:  { label: "Latency threshold",      icon: <Gauge size={14} />,         defaultThreshold: "P95 > 2000ms over 5 min",       description: "Fires when the P95 response latency exceeds the configured threshold." },
  request_spike:      { label: "Request spike",          icon: <Zap size={14} />,           defaultThreshold: "> 3× baseline over 1 min",      description: "Fires when request volume spikes above a multiple of the rolling baseline." },
  policy_violation:   { label: "Policy violation",       icon: <Shield size={14} />,        defaultThreshold: "> 10 denies over 5 min",        description: "Fires when RBAC deny events exceed the configured rate." },
  api_key_abuse:      { label: "API key abuse",          icon: <Key size={14} />,           defaultThreshold: "> 20 auth failures over 5 min", description: "Fires when a single API key triggers repeated authentication failures." },
  quota_exceeded:     { label: "Quota exceeded",         icon: <Gauge size={14} />,         defaultThreshold: "> 90% of rate limit quota",     description: "Fires when a subject approaches or exceeds their rate limit quota." },
  circuit_breaker:    { label: "Circuit breaker opened", icon: <GitBranch size={14} />,     defaultThreshold: "circuit opens",                 description: "Fires when the upstream circuit breaker opens for a server." },
  suspicious_login:   { label: "Suspicious login",       icon: <LogIn size={14} />,         defaultThreshold: "new IP or unusual time",        description: "Fires when an API key is used from an unrecognized IP address." },
  high_risk_tool:     { label: "New high-risk tool",     icon: <Wrench size={14} />,        defaultThreshold: "on registration",               description: "Fires when a tool matching a high-risk pattern is registered on a server." },
};

const SEVERITY_CONFIG: Record<AlertSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  high:     { label: "High",     color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  medium:   { label: "Medium",   color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)" },
  low:      { label: "Low",      color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.12)" },
};

const STATUS_CONFIG: Record<AlertStatus, { label: string; color: string; dot: string }> = {
  firing:   { label: "Firing",   color: "var(--pc-critical)", dot: "var(--pc-critical)" },
  pending:  { label: "Pending",  color: "var(--pc-warning)",  dot: "var(--pc-warning)" },
  ok:       { label: "OK",       color: "var(--pc-success)",  dot: "var(--pc-success)" },
  silenced: { label: "Silenced", color: "var(--pc-muted)",    dot: "var(--pc-muted)" },
};

const CHANNEL_CONFIG: Record<
  NotificationChannel,
  { label: string; icon: React.ReactNode; placeholder: string }
> = {
  email:     { label: "Email",              icon: <Mail size={13} />,           placeholder: "ops@example.com" },
  slack:     { label: "Slack",              icon: <MessageSquare size={13} />,  placeholder: "#alerts-channel" },
  teams:     { label: "Microsoft Teams",    icon: <MessageSquare size={13} />,  placeholder: "https://teams.webhook.url" },
  discord:   { label: "Discord",            icon: <MessageSquare size={13} />,  placeholder: "https://discord.com/api/webhooks/…" },
  webhook:   { label: "Webhook",            icon: <Webhook size={13} />,        placeholder: "https://your-endpoint.example.com" },
  pagerduty: { label: "PagerDuty",          icon: <Phone size={13} />,          placeholder: "Integration key" },
  in_app:    { label: "In-app notification",icon: <Monitor size={13} />,        placeholder: "(delivered to dashboard)" },
};

/* ── demo rules ──────────────────────────────────────────────────────────── */

const DEMO_RULES: AlertRule[] = [];

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── create/edit dialog ──────────────────────────────────────────────────── */

interface RuleFormState {
  name: string;
  type: AlertRuleType;
  severity: AlertSeverity;
  threshold: string;
  windowSeconds: number;
  serverPattern: string;
  description: string;
  channels: Array<{ channel: NotificationChannel; destination: string }>;
}

const BLANK_FORM: RuleFormState = {
  name: "",
  type: "high_error_rate",
  severity: "high",
  threshold: "",
  windowSeconds: 300,
  serverPattern: "*",
  description: "",
  channels: [{ channel: "in_app", destination: "" }],
};

function RuleDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: AlertRule;
  onSave: (r: RuleFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RuleFormState>(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          severity: initial.severity,
          threshold: initial.threshold,
          windowSeconds: initial.windowSeconds,
          serverPattern: initial.serverPattern,
          description: initial.description,
          channels: initial.notifications.map((n) => ({
            channel: n.channel,
            destination: n.destination,
          })),
        }
      : {
          ...BLANK_FORM,
          threshold:
            RULE_TYPE_CONFIG["high_error_rate"].defaultThreshold,
        },
  );

  function setField<K extends keyof RuleFormState>(k: K, v: RuleFormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function addChannel() {
    setForm((prev) => ({
      ...prev,
      channels: [...prev.channels, { channel: "email", destination: "" }],
    }));
  }

  function removeChannel(i: number) {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.filter((_, j) => j !== i),
    }));
  }

  function updateChannel(
    i: number,
    key: "channel" | "destination",
    val: string,
  ) {
    setForm((prev) => {
      const channels = [...prev.channels];
      channels[i] = { ...channels[i], [key]: val };
      return { ...prev, channels };
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 6,
    color: "var(--pc-foreground)",
    fontSize: 12,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--pc-muted)",
    display: "block",
    marginBottom: 4,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

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
          width: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 12,
          zIndex: 60,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pc-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "var(--pc-surface)",
            zIndex: 1,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {initial ? "Edit alert rule" : "Create alert rule"}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* name */}
          <div>
            <label style={labelStyle}>Rule name</label>
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Production error rate"
              style={inputStyle}
            />
          </div>

          {/* type */}
          <div>
            <label style={labelStyle}>Alert type</label>
            <select
              value={form.type}
              onChange={(e) => {
                const t = e.target.value as AlertRuleType;
                setField("type", t);
                setField("threshold", RULE_TYPE_CONFIG[t].defaultThreshold);
              }}
              style={inputStyle}
            >
              {(Object.keys(RULE_TYPE_CONFIG) as AlertRuleType[]).map((t) => (
                <option key={t} value={t}>
                  {RULE_TYPE_CONFIG[t].label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 4 }}>
              {RULE_TYPE_CONFIG[form.type].description}
            </p>
          </div>

          {/* severity + window */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setField("severity", e.target.value as AlertSeverity)}
                style={inputStyle}
              >
                {(Object.keys(SEVERITY_CONFIG) as AlertSeverity[]).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Evaluation window (seconds)</label>
              <input
                type="number"
                value={form.windowSeconds}
                onChange={(e) => setField("windowSeconds", Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* threshold + server pattern */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Threshold description</label>
              <input
                value={form.threshold}
                onChange={(e) => setField("threshold", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Server pattern</label>
              <input
                value={form.serverPattern}
                onChange={(e) => setField("serverPattern", e.target.value)}
                placeholder="* or production-*"
                style={inputStyle}
              />
            </div>
          </div>

          {/* description */}
          <div>
            <label style={labelStyle}>Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* notification channels */}
          <div>
            <label style={labelStyle}>Notification channels</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.channels.map((ch, i) => {
                const cfg = CHANNEL_CONFIG[ch.channel];
                return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={ch.channel}
                      onChange={(e) =>
                        updateChannel(i, "channel", e.target.value)
                      }
                      style={{ ...inputStyle, width: 160, flexShrink: 0 }}
                    >
                      {(Object.keys(CHANNEL_CONFIG) as NotificationChannel[]).map(
                        (c) => (
                          <option key={c} value={c}>
                            {CHANNEL_CONFIG[c].label}
                          </option>
                        ),
                      )}
                    </select>
                    <input
                      value={ch.destination}
                      onChange={(e) =>
                        updateChannel(i, "destination", e.target.value)
                      }
                      placeholder={cfg.placeholder}
                      disabled={ch.channel === "in_app"}
                      style={{ ...inputStyle, flex: 1, opacity: ch.channel === "in_app" ? 0.5 : 1 }}
                    />
                    <button
                      onClick={() => removeChannel(i)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--pc-muted)",
                        padding: 4,
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={addChannel}
                style={{
                  padding: "6px 12px",
                  background: "transparent",
                  border: "1px dashed var(--pc-border)",
                  borderRadius: 6,
                  color: "var(--pc-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  alignSelf: "flex-start",
                }}
              >
                <Plus size={12} />
                Add channel
              </button>
            </div>
          </div>

          {/* footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              paddingTop: 4,
            }}
          >
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
              onClick={() => {
                if (!form.name.trim()) return;
                onSave(form);
                onClose();
              }}
              style={{
                padding: "8px 18px",
                background: "var(--pc-primary)",
                border: "none",
                borderRadius: 6,
                color: "#000",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {initial ? "Save changes" : "Create rule"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── incident types ──────────────────────────────────────────────────────── */

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

const INCIDENT_STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; bg: string }> = {
  investigating: { label: "Investigating", color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  identified:    { label: "Identified",    color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  monitoring:    { label: "Monitoring",    color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)" },
  resolved:      { label: "Resolved",      color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)" },
};

/* ── demo incidents ──────────────────────────────────────────────────────── */

const DEMO_INCIDENTS: Incident[] = [
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
];

/* ── alert rule card ─────────────────────────────────────────────────────── */

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
  incident,
}: {
  rule: AlertRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  incident: Incident | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = RULE_TYPE_CONFIG[rule.type];
  const sevCfg = SEVERITY_CONFIG[rule.severity];
  const statusCfg = STATUS_CONFIG[rule.status];

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: `1px solid ${rule.status === "firing" ? "rgba(240,93,94,0.4)" : "var(--pc-border)"}`,
        borderRadius: 8,
        overflow: "hidden",
        opacity: rule.enabled ? 1 : 0.6,
      }}
    >
      {/* summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
        {/* expand */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 0, flexShrink: 0 }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* status dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusCfg.dot,
            flexShrink: 0,
            boxShadow: rule.status === "firing" ? `0 0 6px ${statusCfg.dot}` : "none",
          }}
        />

        {/* icon + name */}
        <div style={{ color: sevCfg.color, flexShrink: 0 }}>{typeCfg.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--pc-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {rule.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 2 }}>
            {typeCfg.label} · {rule.threshold}
          </div>
        </div>

        {/* badges */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: sevCfg.bg,
              color: sevCfg.color,
            }}
          >
            {sevCfg.label}
          </span>
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: `${statusCfg.dot}22`,
              color: statusCfg.color,
            }}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* last fired */}
        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
          <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
            {relativeTime(rule.lastFiredAt)}
          </div>
          {rule.firingCount > 0 && (
            <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>
              {rule.firingCount}× fired
            </div>
          )}
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={onToggle}
            title={rule.enabled ? "Disable" : "Enable"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: rule.enabled ? "var(--pc-primary)" : "var(--pc-muted)",
              padding: 5,
              borderRadius: 4,
            }}
          >
            {rule.enabled ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button
            onClick={onEdit}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--pc-muted)",
              padding: 5,
              borderRadius: 4,
            }}
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onDelete}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--pc-muted)",
              padding: 5,
              borderRadius: 4,
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--pc-border)", padding: "12px 16px 14px 40px" }}>
          <div style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 12 }}>
            {rule.description}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            {[
              { label: "Server pattern", value: rule.serverPattern },
              { label: "Window", value: rule.windowSeconds > 0 ? `${rule.windowSeconds}s` : "event-driven" },
              { label: "Status", value: STATUS_CONFIG[rule.status].label },
              { label: "Enabled", value: rule.enabled ? "Yes" : "No" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "var(--pc-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: "var(--pc-foreground)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* channels */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--pc-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              Notification channels
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {rule.notifications.map((n, i) => {
                const cfg = CHANNEL_CONFIG[n.channel];
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      background: "var(--pc-elevated)",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "var(--pc-foreground)",
                    }}
                  >
                    {cfg.icon}
                    <span>{cfg.label}</span>
                    {n.destination && (
                      <span style={{ color: "var(--pc-muted)" }}>· {n.destination}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* linked incident */}
          {incident && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "rgba(240,93,94,0.08)",
                border: "1px solid rgba(240,93,94,0.25)",
                borderRadius: 6,
              }}
            >
              <AlertTriangle size={13} style={{ color: "var(--pc-critical)" }} />
              <span style={{ fontSize: 12, color: "var(--pc-foreground)", flex: 1 }}>
                Active incident: <strong>{incident.title}</strong>
              </span>
              <Link
                href={`/dashboard/alerts/incidents/${incident.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "var(--pc-secondary)",
                  textDecoration: "none",
                }}
              >
                View <ExternalLink size={11} />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function AlertsPage() {
  const serversQuery = useListServersV1ServersGet();
  const logsQuery = useListAuditLogsV1AuditGet({ limit: 200 });
  const logs = (logsQuery.data?.data ?? []) as AuditLogView[];
  const servers = (serversQuery.data?.data ?? []) as ServerView[];

  const [rules, setRules] = useState<AlertRule[]>([]); // open source: no demo data — real alerts come from backend when configured
  const [incidents] = useState<Incident[]>([]); // open source: no demo incidents
  const [showCreate, setShowCreate] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [filterStatus, setFilterStatus] = useState<"" | AlertStatus>("");
  const [filterSeverity, setFilterSeverity] = useState<"" | AlertSeverity>("");

  // stats
  const firingCount = rules.filter((r) => r.status === "firing").length;
  const activeIncidentCount = incidents.filter((i) => i.status !== "resolved").length;
  const authFailures = logs.filter((l) => l.event_type === AuditEventType.auth_failure).length;
  const rbacDenies = logs.filter((l) => l.event_type === AuditEventType.rbac_deny).length;
  const unhealthyServers = servers.filter((s) => s.status !== "active").length;

  const filtered = useMemo(() => {
    let r = rules;
    if (filterStatus) r = r.filter((x) => x.status === filterStatus);
    if (filterSeverity) r = r.filter((x) => x.severity === filterSeverity);
    return r;
  }, [rules, filterStatus, filterSeverity]);

  function addRule(form: RuleFormState) {
    const newRule: AlertRule = {
      id: `rule-${Date.now()}`,
      name: form.name,
      type: form.type,
      enabled: true,
      severity: form.severity,
      status: "ok",
      threshold: form.threshold,
      windowSeconds: form.windowSeconds,
      serverPattern: form.serverPattern,
      description: form.description,
      notifications: form.channels.map((c) => ({
        channel: c.channel,
        destination: c.destination,
      })),
      lastFiredAt: null,
      firingCount: 0,
    };
    setRules((prev) => [newRule, ...prev]);
  }

  function saveRule(id: string, form: RuleFormState) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              name: form.name,
              type: form.type,
              severity: form.severity,
              threshold: form.threshold,
              windowSeconds: form.windowSeconds,
              serverPattern: form.serverPattern,
              description: form.description,
              notifications: form.channels.map((c) => ({
                channel: c.channel,
                destination: c.destination,
              })),
            }
          : r,
      ),
    );
  }

  function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled, status: !r.enabled ? "ok" : "silenced" } : r,
      ),
    );
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
      <div className="rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2 mb-4" style={{ background: "rgba(244,185,66,0.10)", borderColor: "rgba(244,185,66,0.35)", color: "#F4B942" }}>
        <span style={{ fontWeight: 600 }}>Demo</span>
        <span style={{ color: "var(--pc-muted)" }}>— alert rules and incidents are local demo — no backend persistence yet.</span>
      </div>
      {/* header */}
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
            <Bell size={20} style={{ color: "var(--pc-primary)" }} />
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Alerts</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
            Threshold-based rules with multi-channel notification routing.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/dashboard/alerts/incidents"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-foreground)",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            <AlertTriangle size={13} />
            Incidents
            {activeIncidentCount > 0 && (
              <span
                style={{
                  background: "var(--pc-critical)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "0 5px",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {activeIncidentCount}
              </span>
            )}
          </Link>
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
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
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
            <Plus size={14} />
            New alert rule
          </button>
        </div>
      </div>

      {/* summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Firing now",        value: String(firingCount),         color: "var(--pc-critical)", icon: <Bell size={15} /> },
          { label: "Active incidents",  value: String(activeIncidentCount), color: "var(--pc-warning)",  icon: <AlertTriangle size={15} /> },
          { label: "Auth failures",     value: String(authFailures),        color: "var(--pc-warning)",  icon: <Key size={15} /> },
          { label: "RBAC denies",       value: String(rbacDenies),          color: "var(--pc-secondary)",icon: <Shield size={15} /> },
          { label: "Unhealthy servers", value: String(unhealthyServers),    color: "var(--pc-critical)", icon: <AlertTriangle size={15} /> },
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
              <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "" | AlertStatus)}
          style={{
            padding: "7px 10px",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 12,
          }}
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as AlertStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as "" | AlertSeverity)}
          style={{
            padding: "7px 10px",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 12,
          }}
        >
          <option value="">All severities</option>
          {(Object.keys(SEVERITY_CONFIG) as AlertSeverity[]).map((s) => (
            <option key={s} value={s}>{SEVERITY_CONFIG[s].label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>
          {filtered.length} rule{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== rules.length && ` (of ${rules.length})`}
        </span>
      </div>

      {/* rule list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          rules.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={EMPTY_STATES.alerts.title}
              description={EMPTY_STATES.alerts.description}
              features={[...EMPTY_STATES.alerts.features]}
              actions={[
                { label: EMPTY_STATES.alerts.primaryAction.label, href: EMPTY_STATES.alerts.primaryAction.href },
                { label: EMPTY_STATES.alerts.docsAction.label,    href: EMPTY_STATES.alerts.docsAction.href, variant: "secondary" },
              ]}
            />
          ) : (
            <FilterEmpty subject="alert rules" onClear={() => {}} />
          )
        ) : (
          filtered.map((rule) => {
            const linkedIncident =
              incidents.find(
                (i) => i.alertRuleId === rule.id && i.status !== "resolved",
              ) ?? null;
            return (
              <RuleCard
                key={rule.id}
                rule={rule}
                incident={linkedIncident}
                onEdit={() => setEditRule(rule)}
                onDelete={() => deleteRule(rule.id)}
                onToggle={() => toggleRule(rule.id)}
              />
            );
          })
        )}
      </div>

      {/* info note */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--pc-muted)",
        }}
      >
        <Info size={12} />
        Alert rules are evaluated client-side in this preview. In production the gateway evaluates rules against real-time telemetry and fires notifications via the configured channels.
      </div>

      {/* create dialog */}
      {showCreate && (
        <RuleDialog
          onSave={addRule}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* edit dialog */}
      {editRule && (
        <RuleDialog
          initial={editRule}
          onSave={(form) => saveRule(editRule.id, form)}
          onClose={() => setEditRule(null)}
        />
      )}
    </div>
  );
}
