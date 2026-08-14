"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useListServersV1ServersGet,
  useListApiKeysV1ApiKeysGet,
  useListAuditLogsV1AuditGet,
  type ServerView,
  type AuditLogView,
} from "@/api/generated";
import {
  Server,
  Wrench,
  Key,
  Activity,
  CheckCircle2,
  Gauge,
  Star,
  BookOpen,
  Play,
  FileText,
  ChevronRight,
  Megaphone,
  AlertTriangle,
  X,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Relative time helper ──────────────────────────────────────────────────

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)} days ago`;
}

// ─── Outcome badge ─────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  let bg = "rgba(53,200,138,0.12)";
  let color = "var(--pc-success)";
  if (outcome === "auth_failure") {
    bg = "rgba(240,93,94,0.12)";
    color = "var(--pc-critical)";
  } else if (outcome === "rbac_deny") {
    bg = "rgba(244,185,66,0.12)";
    color = "var(--pc-warning)";
  }
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "999px",
        whiteSpace: "nowrap" as const,
      }}
    >
      {outcome}
    </span>
  );
}

// ─── Summary card ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconColor,
  loading,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconColor: string;
  loading: boolean;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);
  const iconBg = `${iconColor}20`;

  const inner = (
    <div
      style={{
        background: "var(--pc-surface)",
        border: `1px solid ${hovered ? iconColor : "var(--pc-border)"}`,
        borderRadius: "16px",
        padding: "20px",
        cursor: "pointer",
        transition: "border-color 0.15s",
        height: "100%",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
        <ArrowRight
          size={14}
          strokeWidth={2}
          style={{
            color: "var(--pc-primary)",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        />
      </div>
      {loading ? (
        <Skeleton style={{ height: "32px", width: "64px", background: "var(--pc-elevated)", borderRadius: "6px", marginBottom: "6px" }} />
      ) : (
        <p style={{ fontSize: "28px", fontWeight: 700, color: "var(--pc-foreground)", fontVariantNumeric: "tabular-nums", margin: 0, lineHeight: 1.1 }}>
          {value}
        </p>
      )}
      <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--pc-muted)", margin: "6px 0 0 0" }}>{label}</p>
    </div>
  );

  return <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link>;
}

// ─── Quick action tile ─────────────────────────────────────────────────────

function ActionTile({
  label,
  description,
  icon: Icon,
  iconColor,
  href,
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: "var(--pc-elevated)",
          border: `1px solid ${hovered ? iconColor : "var(--pc-border)"}`,
          borderRadius: "12px",
          padding: "14px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            background: `${iconColor}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={16} strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--pc-foreground)", margin: 0 }}>{label}</p>
          <p style={{ fontSize: "11px", color: "var(--pc-muted)", margin: "3px 0 0 0" }}>{description}</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Section heading ───────────────────────────────────────────────────────

function SectionHeading({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--pc-foreground)", margin: 0 }}>{children}</h2>
      {href && linkLabel && (
        <Link
          href={href}
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 500, color: "var(--pc-primary)", textDecoration: "none" }}
        >
          {linkLabel} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

// ─── Card wrapper ──────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: "16px",
        padding: "20px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Demo data ─────────────────────────────────────────────────────────────

const RECENT_TOOLS = [
  { tool: "memory/store_memory", server: "prod-mcp", ago: "2m ago" },
  { tool: "filesystem/read_file", server: "staging-mcp", ago: "15m ago" },
  { tool: "github/search_code", server: "prod-mcp", ago: "1h ago" },
  { tool: "slack/send_message", server: "prod-mcp", ago: "3h ago" },
  { tool: "sqlite/query", server: "dev-mcp", ago: "yesterday" },
];

const ALL_FAVORITES_INIT = [
  "memory/store_memory",
  "filesystem/read_file",
  "github/search_code",
];

const ANNOUNCEMENTS = [
  {
    title: "Production MCP v2.1 deployed",
    body: "Added 12 new filesystem tools",
    ago: "2 days ago",
  },
  {
    title: "New rate limits in effect",
    body: "Developer tier: 10k req/day",
    ago: "5 days ago",
  },
];

const DOC_LINKS = [
  "Quick Start Guide",
  "Authentication & API Keys",
  "Tool Reference",
  "Rate Limits & Quotas",
  "SDK & Code Examples",
];

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperHomePage() {
  const [favorites, setFavorites] = useState<string[]>(ALL_FAVORITES_INIT);
  const [incidentDismissed, setIncidentDismissed] = useState(false);
  const [demoReferenceTime] = useState(Date.now);

  const { data: serversResp, isLoading: loadingServers } = useListServersV1ServersGet();
  const { data: keysResp, isLoading: loadingKeys } = useListApiKeysV1ApiKeysGet();
  const { data: auditResp, isLoading: loadingAudit } = useListAuditLogsV1AuditGet({ limit: 100 });

  const servers = (Array.isArray(serversResp?.data) ? serversResp.data : []) as ServerView[];
  const keys = Array.isArray(keysResp?.data) ? keysResp.data : [];
  const audit = (Array.isArray(auditResp?.data) ? auditResp.data : []) as AuditLogView[];

  const activeServers = servers.filter((s) => s.status === "active");

  // Today's audit logs
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayAudit = audit.filter((a) => new Date(a.created_at) >= todayStart);

  // Success rate
  const denied = (outcome: string) => outcome === "auth_failure" || outcome === "rbac_deny";
  const successRate =
    audit.length === 0
      ? "98.2%"
      : `${((audit.filter((a) => !denied(a.outcome)).length / audit.length) * 100).toFixed(1)}%`;

  // Today's date string
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const removeFavorite = (tool: string) => setFavorites((prev) => prev.filter((f) => f !== tool));

  // Last 5 audit rows (or demo)
  const auditRows: AuditLogView[] =
    audit.length > 0
      ? audit.slice(0, 5)
      : ([
          { id: "d1", subject_id: "dev", event_type: "tool_call", tool_name: "memory/store_memory", server_slug: "prod-mcp", outcome: "success", created_at: new Date(demoReferenceTime - 2 * 60 * 1000).toISOString() },
          { id: "d2", subject_id: "dev", event_type: "tool_call", tool_name: "filesystem/read_file", server_slug: "staging-mcp", outcome: "success", created_at: new Date(demoReferenceTime - 15 * 60 * 1000).toISOString() },
          { id: "d3", subject_id: "dev", event_type: "tool_call", tool_name: "github/search_code", server_slug: "prod-mcp", outcome: "rbac_deny", created_at: new Date(demoReferenceTime - 60 * 60 * 1000).toISOString() },
          { id: "d4", subject_id: "dev", event_type: "tool_call", tool_name: "slack/send_message", server_slug: "prod-mcp", outcome: "auth_failure", created_at: new Date(demoReferenceTime - 3 * 60 * 60 * 1000).toISOString() },
          { id: "d5", subject_id: "dev", event_type: "tool_call", tool_name: "sqlite/query", server_slug: "dev-mcp", outcome: "success", created_at: new Date(demoReferenceTime - 24 * 60 * 60 * 1000).toISOString() },
        ] as AuditLogView[]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--pc-foreground)", margin: 0, letterSpacing: "-0.3px" }}>
          Welcome back
        </h1>
        <p style={{ fontSize: "13px", color: "var(--pc-muted)", margin: "4px 0 0 0" }}>
          Your developer workspace · {todayLabel}
        </p>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "14px",
        }}
        className="dev-summary-grid"
      >
        <SummaryCard
          label="Available Servers"
          value={activeServers.length}
          icon={Server}
          iconColor="var(--pc-secondary)"
          loading={loadingServers}
          href="/developer/servers"
        />
        <SummaryCard
          label="Available Tools"
          value={47}
          icon={Wrench}
          iconColor="var(--pc-primary)"
          loading={false}
          href="/developer/tools"
        />
        <SummaryCard
          label="My API Keys"
          value={keys.length}
          icon={Key}
          iconColor="var(--pc-warning)"
          loading={loadingKeys}
          href="/developer/api-keys"
        />
        <SummaryCard
          label="Requests Today"
          value={loadingAudit ? "—" : todayAudit.length}
          icon={Activity}
          iconColor="var(--pc-success)"
          loading={loadingAudit}
          href="/developer/logs"
        />
        <SummaryCard
          label="Success Rate"
          value={loadingAudit ? "—" : successRate}
          icon={CheckCircle2}
          iconColor="var(--pc-primary)"
          loading={loadingAudit}
          href="/developer/logs"
        />
        <SummaryCard
          label="Remaining Quota"
          value="187,520"
          icon={Gauge}
          iconColor="var(--pc-secondary)"
          loading={false}
          href="/developer/logs"
        />
      </div>

      {/* ── Active incident strip ────────────────────────────────────────────── */}
      {!incidentDismissed && (
        <div
          style={{
            background: "rgba(240,93,94,0.08)",
            border: "1px solid rgba(240,93,94,0.35)",
            borderRadius: "12px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <AlertTriangle size={16} strokeWidth={2} style={{ color: "var(--pc-critical)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--pc-critical)", marginRight: "8px" }}>
              CRITICAL
            </span>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--pc-foreground)" }}>
              Staging MCP server health check failing
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--pc-warning)",
                background: "rgba(244,185,66,0.12)",
                borderRadius: "999px",
                padding: "1px 8px",
                marginLeft: "10px",
              }}
            >
              investigating
            </span>
          </div>
          <Link
            href="/dashboard/alerts/incidents/inc-001"
            style={{ fontSize: "12px", fontWeight: 600, color: "var(--pc-critical)", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            View incident →
          </Link>
          <button
            onClick={() => setIncidentDismissed(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: "var(--pc-muted)",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
            aria-label="Dismiss incident"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "20px",
          alignItems: "start",
        }}
        className="dev-two-col"
      >

        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Recently used tools */}
          <Card>
            <SectionHeading href="/developer/playground" linkLabel="Open playground">
              Recently Used Tools
            </SectionHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {RECENT_TOOLS.map((t) => (
                <div
                  key={t.tool}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--pc-elevated)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "rgba(45,212,167,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Wrench size={14} strokeWidth={1.75} style={{ color: "var(--pc-primary)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--pc-foreground)", margin: 0, fontFamily: "monospace" }}>
                      {t.tool}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--pc-muted)", margin: "2px 0 0 0" }}>
                      {t.server} · {t.ago}
                    </p>
                  </div>
                  <Link
                    href={`/developer/playground?tool=${encodeURIComponent(t.tool)}`}
                    style={{ fontSize: "12px", fontWeight: 600, color: "var(--pc-primary)", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    Try →
                  </Link>
                </div>
              ))}
            </div>
          </Card>

          {/* Favorite tools */}
          <Card>
            <SectionHeading href="/developer/tools" linkLabel="Add more">
              <Star size={13} strokeWidth={2} style={{ color: "var(--pc-warning)", display: "inline", marginRight: "6px", verticalAlign: "middle" }} />
              Favorite Tools
            </SectionHeading>
            {favorites.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--pc-muted)", margin: "8px 0" }}>
                No favorites yet. <Link href="/developer/tools" style={{ color: "var(--pc-primary)" }}>Browse tools →</Link>
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {favorites.map((tool) => (
                  <div
                    key={tool}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--pc-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <Star size={14} strokeWidth={1.75} style={{ color: "var(--pc-warning)", flexShrink: 0 }} />
                    <p style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "var(--pc-foreground)", margin: 0, fontFamily: "monospace", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tool}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <Link
                        href={`/developer/playground?tool=${encodeURIComponent(tool)}`}
                        style={{ fontSize: "12px", fontWeight: 600, color: "var(--pc-primary)", textDecoration: "none" }}
                      >
                        Try →
                      </Link>
                      <button
                        onClick={() => removeFavorite(tool)}
                        style={{
                          background: "none",
                          border: "1px solid var(--pc-border)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: 500,
                          color: "var(--pc-muted)",
                          padding: "2px 8px",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Star size={10} strokeWidth={2} /> Unfavorite
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent requests */}
          <Card>
            <SectionHeading href="/developer/logs" linkLabel="View all logs">
              Recent Requests
            </SectionHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {auditRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--pc-elevated)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--pc-foreground)", margin: 0, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.tool_name ?? "—"}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--pc-muted)", margin: "2px 0 0 0" }}>
                      {row.server_slug ?? "—"}
                    </p>
                  </div>
                  <OutcomeBadge outcome={row.outcome} />
                  <span style={{ fontSize: "11px", color: "var(--pc-muted)", flexShrink: 0, minWidth: "60px", textAlign: "right" }}>
                    {relativeTime(row.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Sidebar column ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Quick actions */}
          <div>
            <SectionHeading>Quick Actions</SectionHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <ActionTile
                label="Explore Tools"
                description="Browse MCP tools across all servers"
                icon={Wrench}
                iconColor="var(--pc-primary)"
                href="/developer/tools"
              />
              <ActionTile
                label="Generate API Key"
                description="Create a personal access token"
                icon={Key}
                iconColor="var(--pc-warning)"
                href="/developer/api-keys"
              />
              <ActionTile
                label="Test a Tool"
                description="Invoke tools interactively"
                icon={Play}
                iconColor="var(--pc-success)"
                href="/developer/playground"
              />
              <ActionTile
                label="View Documentation"
                description="Guides, references, and examples"
                icon={BookOpen}
                iconColor="var(--pc-secondary)"
                href="/developer/docs"
              />
            </div>
          </div>

          {/* Team announcements */}
          <div>
            <SectionHeading>Team Announcements</SectionHeading>
            <Card style={{ padding: "0" }}>
              {ANNOUNCEMENTS.map((ann, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "14px 16px",
                    borderBottom: i < ANNOUNCEMENTS.length - 1 ? "1px solid var(--pc-border)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "8px",
                      background: "rgba(72,184,232,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    <Megaphone size={13} strokeWidth={1.75} style={{ color: "var(--pc-secondary)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--pc-foreground)", margin: 0 }}>
                      {ann.title}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--pc-muted)", margin: "3px 0 0 0" }}>
                      {ann.body}
                    </p>
                    <p style={{ fontSize: "10px", color: "var(--pc-muted)", margin: "4px 0 0 0", opacity: 0.7 }}>
                      {ann.ago}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          {/* Documentation shortcuts */}
          <div>
            <SectionHeading>Documentation</SectionHeading>
            <Card style={{ padding: "0" }}>
              {DOC_LINKS.map((label, i) => (
                <Link
                  key={label}
                  href="/developer/docs"
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "11px 16px",
                      borderBottom: i < DOC_LINKS.length - 1 ? "1px solid var(--pc-border)" : "none",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--pc-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <FileText size={13} strokeWidth={1.75} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "var(--pc-foreground)" }}>
                      {label}
                    </span>
                    <ChevronRight size={13} strokeWidth={2} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                  </div>
                </Link>
              ))}
            </Card>
          </div>

        </div>
      </div>

      {/* ── Responsive styles ────────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 900px) {
          .dev-two-col {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .dev-summary-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 380px) {
          .dev-summary-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
