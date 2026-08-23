"use client";

import Link from "next/link";
import { LucideIcon, CheckCircle2 } from "lucide-react";

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Short bullet-points explaining what the feature enables once set up */
  features?: string[];
  actions?: Action[];
  /** Compact mode — used inside tables/panels, not full-page */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  features = [],
  actions = [],
  compact = false,
}: EmptyStateProps) {
  const pad  = compact ? "28px 24px" : "64px 32px";
  const iSz  = compact ? 44 : 56;
  const iRad = compact ? 12 : 14;
  const gap  = compact ? 12 : 18;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: pad,
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 12,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: iSz,
          height: iSz,
          borderRadius: iRad,
          background: "var(--pc-elevated)",
          border: "1px solid var(--pc-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: gap,
        }}
      >
        <Icon
          size={compact ? 20 : 24}
          strokeWidth={1.5}
          style={{ color: "var(--pc-muted)" }}
        />
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: compact ? 14 : 16,
          fontWeight: 700,
          color: "var(--pc-foreground)",
          marginBottom: 8,
        }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontSize: 13,
          color: "var(--pc-muted)",
          lineHeight: 1.7,
          maxWidth: 400,
          marginBottom: features.length > 0 ? 16 : actions.length > 0 ? 20 : 0,
        }}
      >
        {description}
      </p>

      {/* Feature bullets */}
      {features.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            marginBottom: actions.length > 0 ? 24 : 0,
            display: "flex",
            flexDirection: "column",
            gap: 7,
            textAlign: "left",
            maxWidth: 340,
          }}
        >
          {features.map((f) => (
            <li
              key={f}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
                color: "var(--pc-muted)",
                lineHeight: 1.5,
              }}
            >
              <CheckCircle2
                size={13}
                strokeWidth={2}
                style={{ color: "var(--pc-primary)", flexShrink: 0, marginTop: 1 }}
              />
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {actions.map((action, i) => {
            const isPrimary = action.variant !== "secondary" && i === 0;
            const style: React.CSSProperties = {
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              ...(isPrimary
                ? {
                    background: "var(--pc-primary)",
                    color: "#0C1116",
                    border: "none",
                  }
                : {
                    background: "transparent",
                    color: "var(--pc-muted)",
                    border: "1px solid var(--pc-border)",
                  }),
            };

            return action.href ? (
              <Link key={action.label} href={action.href} style={style}>
                {action.label}
              </Link>
            ) : (
              <button key={action.label} onClick={action.onClick} style={style}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Filter-empty variant (no results after searching/filtering) ─────────── */

interface FilterEmptyProps {
  subject?: string;
  onClear?: () => void;
}

export function FilterEmpty({ subject = "results", onClear }: FilterEmptyProps) {
  return (
    <div
      style={{
        padding: "36px 24px",
        textAlign: "center",
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 12,
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 4 }}>
        No {subject} match your filters
      </p>
      <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: onClear ? 14 : 0 }}>
        Try adjusting your search terms or removing some filters.
      </p>
      {onClear && (
        <button
          onClick={onClear}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--pc-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

/* ── Table-row empty (for use inside <tbody>) ────────────────────────────── */

export function TableEmpty({
  colSpan,
  subject = "entries",
}: {
  colSpan: number;
  subject?: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{ padding: "40px 16px", textAlign: "center", color: "var(--pc-muted)", fontSize: 13 }}
      >
        No {subject} match the current filters
      </td>
    </tr>
  );
}

/* ── Pre-built empty state configurations ────────────────────────────────── */

export const EMPTY_STATES = {
  servers: {
    title: "No MCP servers registered",
    description:
      "Connect your first MCP server to start discovering tools, enforcing access policies, and monitoring traffic across your organization.",
    features: [
      "Discover and catalogue all tools exposed by the server",
      "Apply RBAC policies to control which roles can invoke which tools",
      "Monitor real-time traffic, latency, and error rates per server",
      "Receive health alerts if a server goes offline or degrades",
    ],
    primaryAction: { label: "Register MCP Server", href: "/dashboard/servers/new" },
    docsAction:    { label: "View setup guide",    href: "/developer/docs#servers", variant: "secondary" as const },
  },

  tools: {
    title: "No tools discovered yet",
    description:
      "Tools are capabilities exposed by your connected MCP servers. Register a server and Portcullis will automatically discover its tool catalogue.",
    features: [
      "Browse and search every tool across all connected servers",
      "Permission tools per role — allow, deny, or rate-limit at the tool level",
      "Test tools interactively in the playground before granting access",
      "See usage counts and audit trails per tool",
    ],
    primaryAction: { label: "Go to Servers",   href: "/dashboard/servers" },
    docsAction:    { label: "Tool reference",  href: "/developer/docs#tools", variant: "secondary" as const },
  },

  apiKeys: {
    title: "No API keys yet",
    description:
      "API keys authenticate requests to the Portcullis gateway. Each key can be scoped to specific servers, tools, and rate limits.",
    features: [
      "Scope keys to specific servers or tool patterns for least-privilege access",
      "Rotate keys without downtime by issuing a new key before revoking the old one",
      "Track last-used timestamps to identify stale or unused keys",
      "Set short-lived keys with automatic expiry for CI and ephemeral workloads",
    ],
    primaryAction: { label: "Create API Key",     href: "/dashboard/api-keys?new=1" },
    docsAction:    { label: "Authentication docs", href: "/developer/docs#auth", variant: "secondary" as const },
  },

  policies: {
    title: "No access policies configured",
    description:
      "Policies define who can call which tools on which servers. Without policies, access defaults to your organization's baseline role permissions.",
    features: [
      "Allow or deny specific tools by role, user, or API key",
      "Target by server slug or tool name pattern (wildcards supported)",
      "Stack multiple policies — priority ordering resolves conflicts",
      "Policies apply in real-time; no restart or deployment needed",
    ],
    primaryAction: { label: "Create Policy",  href: "/dashboard/policies?new=1" },
    docsAction:    { label: "RBAC guide",     href: "/developer/docs#rbac", variant: "secondary" as const },
  },

  rateLimits: {
    title: "No rate limit policies",
    description:
      "Rate limit policies protect your MCP servers from overuse. Default org-wide limits apply until you configure explicit rules.",
    features: [
      "Set per-key, per-role, or per-tool request limits",
      "Choose between fixed window, sliding window, or token bucket algorithms",
      "Override defaults for power users or CI pipelines",
      "Burst capacity settings handle short spikes without hard-blocking",
    ],
    primaryAction: { label: "Add Rate Limit Policy", href: "/dashboard/rate-limits?new=1" },
    docsAction:    { label: "Rate limit docs",        href: "/developer/docs#rate-limits", variant: "secondary" as const },
  },

  team: {
    title: "No team members yet",
    description:
      "Invite colleagues to collaborate on server management, policy configuration, incident response, and access reviews.",
    features: [
      "Assign roles to control what each member can see and change",
      "Members can view audit logs, manage alerts, and use the playground",
      "Revoke access instantly if someone leaves the organization",
      "Pending invites expire after 7 days for security",
    ],
    primaryAction: { label: "Invite Member",    href: "/dashboard/access-control?tab=members" },
    docsAction:    { label: "Team access guide", href: "/developer/docs#rbac", variant: "secondary" as const },
  },

  roles: {
    title: "No roles configured",
    description:
      "Roles group permissions together so you can manage access at scale. Assign members to roles instead of setting permissions individually.",
    features: [
      "Seed standard roles (Admin, Developer, Auditor) in one click",
      "Create custom roles to match your team's structure",
      "Roles compose with per-tool policies for fine-grained control",
    ],
    primaryAction: { label: "Create Role",    href: "/dashboard/access-control?tab=roles" },
    docsAction:    { label: "RBAC overview",  href: "/developer/docs#rbac", variant: "secondary" as const },
  },

  alerts: {
    title: "No alert rules configured",
    description:
      "Alert rules watch for conditions you care about — server downtime, authentication failures, quota thresholds — and notify your team instantly.",
    features: [
      "Get notified by email, Slack, or webhook when a server goes unhealthy",
      "Set thresholds on error rate, latency, or request volume",
      "Auto-create incidents when alert conditions are met",
      "Suppress alerts during planned maintenance windows",
    ],
    primaryAction: { label: "Create Alert Rule",  href: "/dashboard/alerts?new=1" },
    docsAction:    { label: "Alerts guide",       href: "/developer/docs#alerts", variant: "secondary" as const },
  },

  incidents: {
    title: "No incidents — all clear",
    description:
      "Incidents are created automatically when alert rules fire, or you can declare them manually for planned downtime or degradation events.",
    features: [
      "Incidents trigger notifications to all subscribed team members",
      "Track status through Investigating → Identified → Mitigating → Resolved",
      "Post timeline updates visible to the whole team",
    ],
    primaryAction: null,
    docsAction:    null,
  },

  audit: {
    title: "No audit events recorded",
    description:
      "Every configuration change, access decision, and tool invocation is logged here. Audit events are immutable and retained for 90 days.",
    features: [
      "Filter by event type, server, tool, subject, or outcome",
      "Export to CSV for compliance reporting",
      "Cross-reference with incidents to understand what changed before an outage",
    ],
    primaryAction: null,
    docsAction:    { label: "Audit log docs", href: "/developer/docs#observability", variant: "secondary" as const },
  },

  requests: {
    title: "No requests logged yet",
    description:
      "Every tool invocation through the gateway appears here. Make your first API call to see it logged with full context.",
    features: [
      "See outcome (allowed/denied), latency, and error details per call",
      "Filter by server, tool name, or subject to trace specific flows",
      "Use audit log events to diagnose access denials and errors",
    ],
    primaryAction: { label: "Open Playground", href: "/developer/playground" },
    docsAction:    { label: "SDK examples",    href: "/developer/docs#sdk", variant: "secondary" as const },
  },

  integrations: {
    title: "No integrations connected",
    description:
      "Integrations extend Portcullis with your existing identity providers, observability platforms, and notification channels.",
    features: [
      "Connect Slack or PagerDuty to receive alert notifications",
      "Integrate with Datadog or Grafana for metric forwarding",
      "Use OIDC or SAML to federate login through your identity provider",
    ],
    primaryAction: { label: "Browse Integrations", href: "/dashboard/integrations" },
    docsAction:    null,
  },

  notifications: {
    title: "You're all caught up",
    description: "No new notifications. We'll alert you when something needs your attention.",
    features: [],
    primaryAction: null,
    docsAction:    null,
  },

  devServers: {
    title: "No servers available",
    description:
      "You don't have access to any MCP servers yet. Servers expose the tools you can call through the Portcullis gateway.",
    features: [
      "Each server has its own tool catalogue — browse them in Tool Explorer",
      "Some servers require an explicit access request from your org admin",
      "Use the playground to test tools once access is granted",
    ],
    primaryAction: { label: "Request Access", href: "/developer/servers" },
    docsAction:    { label: "Getting started", href: "/developer/docs#quickstart", variant: "secondary" as const },
  },

  devApiKeys: {
    title: "No API keys yet",
    description:
      "Create a personal API key to authenticate your code against the Portcullis gateway. Each key inherits your role's permissions.",
    features: [
      "Scope keys to specific servers or tool patterns for least-privilege access",
      "Copy ready-to-use code snippets in Python, Node.js, or curl",
      "Set an expiry date for short-lived CI or automation keys",
    ],
    primaryAction: { label: "Create API Key",     href: "/developer/api-keys?new=1" },
    docsAction:    { label: "Authentication docs", href: "/developer/docs#auth", variant: "secondary" as const },
  },
} as const;
