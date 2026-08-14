"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useListServersV1ServersGet,
  type ServerView,
} from "@/api/generated";
import {
  Server as ServerIcon,
  Search,
  Wrench,
  Play,
  BookOpen,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  Users,
  Filter,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, FilterEmpty, EMPTY_STATES } from "@/components/empty-state";

/* ── demo metadata ───────────────────────────────────────────────────────── */

interface ServerMeta {
  description: string;
  owner: string;
  toolCount: number;
  environment: "production" | "staging" | "development";
  docsUrl: string;
  hasAccess: boolean;
}

function inferMeta(slug: string): ServerMeta {
  const lower = slug.toLowerCase();
  const env: ServerMeta["environment"] = lower.includes("prod")
    ? "production"
    : lower.includes("stag")
    ? "staging"
    : "development";

  const demos: Record<string, Partial<ServerMeta>> = {
    "production-mcp": {
      description: "Primary production MCP gateway. Provides filesystem, memory, and GitHub integrations.",
      owner: "platform-team",
      toolCount: 24,
      environment: "production",
      hasAccess: true,
    },
    "staging-mcp": {
      description: "Pre-production staging environment for testing new tool integrations.",
      owner: "platform-team",
      toolCount: 18,
      environment: "staging",
      hasAccess: true,
    },
    "dev-mcp": {
      description: "Development sandbox with experimental tools. Not stable for production use.",
      owner: "dev-infra",
      toolCount: 31,
      environment: "development",
      hasAccess: false,
    },
  };

  const override = demos[lower] ?? {};
  return {
    description: override.description ?? `MCP server providing tools for the ${env} environment.`,
    owner: override.owner ?? "platform-team",
    toolCount: override.toolCount ?? Math.floor(Math.random() * 20) + 5,
    environment: override.environment ?? env,
    docsUrl: `/developer/docs?server=${encodeURIComponent(slug)}`,
    hasAccess: override.hasAccess ?? true,
  };
}

const ENV_CONFIG = {
  production:  { label: "Production",  color: "var(--pc-success)",   bg: "rgba(53,200,138,0.12)" },
  staging:     { label: "Staging",     color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)" },
  development: { label: "Development", color: "var(--pc-secondary)", bg: "rgba(72,184,232,0.12)" },
};

/* ── demo servers when API is empty ─────────────────────────────────────── */

const now = new Date().toISOString();
const DEMO_SERVERS: ServerView[] = [
  { id: "s1", tenant_id: "t1", name: "Production MCP", slug: "production-mcp", status: "active", upstream_url: "https://mcp.prod.example.com",    transport: "streamable_http", auth_mode: "service_token", health_check_path: "/health", consecutive_health_failures: 0, last_health_check_at: now, created_at: now, updated_at: now },
  { id: "s2", tenant_id: "t1", name: "Staging MCP",    slug: "staging-mcp",    status: "active", upstream_url: "https://mcp.staging.example.com", transport: "streamable_http", auth_mode: "service_token", health_check_path: "/health", consecutive_health_failures: 0, last_health_check_at: now, created_at: now, updated_at: now },
  { id: "s3", tenant_id: "t1", name: "Dev MCP",        slug: "dev-mcp",        status: "active", upstream_url: "http://localhost:3001",            transport: "streamable_http", auth_mode: "none",          health_check_path: "/health", consecutive_health_failures: 2, last_health_check_at: now, created_at: now, updated_at: now },
];

/* ── components ──────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status: string }) {
  const ok = status === "active";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 9999,
        background: ok ? "rgba(53,200,138,0.12)" : "rgba(139,152,167,0.12)",
        color: ok ? "var(--pc-success)" : "var(--pc-muted)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: ok ? "var(--pc-success)" : "var(--pc-muted)",
        }}
      />
      {status}
    </span>
  );
}

function EnvBadge({ env }: { env: keyof typeof ENV_CONFIG }) {
  const cfg = ENV_CONFIG[env];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 6,
        background: cfg.bg,
        color: cfg.color,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {cfg.label}
    </span>
  );
}

function AccessBadge({ hasAccess }: { hasAccess: boolean }) {
  return hasAccess ? (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--pc-primary)",
      }}
    >
      <CheckCircle2 size={12} />
      Access granted
    </span>
  ) : (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--pc-muted)",
      }}
    >
      <Lock size={12} />
      Request required
    </span>
  );
}

function RequestAccessModal({ serverSlug, onClose }: { serverSlug: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
    setTimeout(onClose, 1800);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 12,
          width: 420,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Request access</div>
          <div style={{ fontSize: 12, color: "var(--pc-muted)" }}>
            Submit a request to join{" "}
            <span style={{ fontFamily: "monospace", color: "var(--pc-primary)" }}>{serverSlug}</span>
          </div>
        </div>

        {sent ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 14,
              background: "rgba(53,200,138,0.1)",
              border: "1px solid rgba(53,200,138,0.3)",
              borderRadius: 8,
              color: "var(--pc-success)",
              fontSize: 13,
            }}
          >
            <CheckCircle2 size={16} />
            Request sent! Your admin will review it shortly.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-muted)", display: "block", marginBottom: 5 }}>
                Reason for access
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                placeholder="Describe why you need access to this server…"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  color: "var(--pc-foreground)",
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "7px 16px",
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
                type="submit"
                style={{
                  padding: "7px 16px",
                  background: "var(--pc-primary)",
                  border: "none",
                  borderRadius: 6,
                  color: "#0C1116",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Submit request
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onRequestAccess,
}: {
  server: ServerView;
  onRequestAccess: (slug: string) => void;
}) {
  const meta = useMemo(() => inferMeta(server.slug), [server.slug]);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--pc-primary)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--pc-border)")}
    >
      {/* card body */}
      <div style={{ padding: 18 }}>
        {/* top row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                background: "rgba(45,212,167,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ServerIcon size={18} style={{ color: "var(--pc-primary)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: "var(--pc-foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {server.slug}
              </div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 1, fontFamily: "monospace" }}>
                {server.upstream_url}
              </div>
            </div>
          </div>
          <StatusDot status={server.status} />
        </div>

        {/* badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <EnvBadge env={meta.environment} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 6,
              background: "var(--pc-elevated)",
              color: "var(--pc-muted)",
            }}
          >
            {server.transport}
          </span>
        </div>

        {/* description */}
        <p style={{ fontSize: 12, color: "var(--pc-muted)", lineHeight: 1.6, marginBottom: 12 }}>
          {meta.description}
        </p>

        {/* meta row */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--pc-muted)" }}>
            <Wrench size={12} />
            {meta.toolCount} tools
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--pc-muted)" }}>
            <Users size={12} />
            {meta.owner}
          </div>
          <AccessBadge hasAccess={meta.hasAccess} />
        </div>
      </div>

      {/* footer actions */}
      <div
        style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--pc-border)",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Link
          href={`/developer/tools?server=${encodeURIComponent(server.slug)}`}
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "6px 12px",
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 12,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <Wrench size={12} />
          Explore Tools
        </Link>

        <Link
          href={`/developer/playground?server=${encodeURIComponent(server.slug)}`}
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "6px 12px",
            background: meta.hasAccess ? "var(--pc-primary)" : "var(--pc-elevated)",
            border: meta.hasAccess ? "none" : "1px solid var(--pc-border)",
            borderRadius: 6,
            color: meta.hasAccess ? "#0C1116" : "var(--pc-muted)",
            fontSize: 12,
            fontWeight: meta.hasAccess ? 700 : 500,
            textDecoration: "none",
          }}
        >
          <Play size={12} />
          Test
        </Link>

        {!meta.hasAccess && (
          <button
            onClick={() => onRequestAccess(server.slug)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: "6px 12px",
              background: "rgba(244,185,66,0.1)",
              border: "1px solid rgba(244,185,66,0.3)",
              borderRadius: 6,
              color: "var(--pc-warning)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Lock size={12} />
            Request Access
          </button>
        )}

        <a
          href={meta.docsUrl}
          title="Documentation"
          style={{
            padding: "6px 10px",
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            color: "var(--pc-muted)",
            textDecoration: "none",
          }}
        >
          <BookOpen size={13} />
        </a>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Skeleton className="w-10 h-10 rounded-lg" style={{ background: "var(--pc-elevated)" }} />
        <div style={{ flex: 1 }}>
          <Skeleton className="h-4 w-32 mb-2 rounded" style={{ background: "var(--pc-elevated)" }} />
          <Skeleton className="h-3 w-48 rounded" style={{ background: "var(--pc-elevated)" }} />
        </div>
      </div>
      <Skeleton className="h-3 w-full mb-2 rounded" style={{ background: "var(--pc-elevated)" }} />
      <Skeleton className="h-3 w-3/4 rounded" style={{ background: "var(--pc-elevated)" }} />
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

type EnvFilter = "all" | "production" | "staging" | "development";

export default function DeveloperServersPage() {
  const { data: resp, isLoading } = useListServersV1ServersGet();
  const rawServers = (Array.isArray(resp?.data) ? resp!.data : []) as ServerView[];
  const servers = rawServers.length > 0 ? rawServers : DEMO_SERVERS;

  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [requestSlug, setRequestSlug] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      const meta = inferMeta(s.slug);
      const matchSearch =
        !search ||
        s.slug.toLowerCase().includes(search.toLowerCase()) ||
        s.upstream_url.toLowerCase().includes(search.toLowerCase()) ||
        meta.description.toLowerCase().includes(search.toLowerCase()) ||
        meta.owner.toLowerCase().includes(search.toLowerCase());
      const matchEnv = envFilter === "all" || meta.environment === envFilter;
      return matchSearch && matchEnv;
    });
  }, [servers, search, envFilter]);

  const activeCount = servers.filter((s) => s.status === "active").length;
  const accessCount = servers.filter((s) => inferMeta(s.slug).hasAccess).length;

  const ENV_FILTERS: { value: EnvFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "production", label: "Production" },
    { value: "staging", label: "Staging" },
    { value: "development", label: "Development" },
  ];

  return (
    <div style={{ color: "var(--pc-foreground)" }}>
      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <ServerIcon size={20} style={{ color: "var(--pc-secondary)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Available Servers</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          MCP servers you have access to ·{" "}
          <span style={{ color: "var(--pc-success)" }}>{activeCount} active</span>
          {" · "}
          <span style={{ color: "var(--pc-primary)" }}>{accessCount} accessible</span>
        </p>
      </div>

      {/* search + filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
          }}
        >
          <Search size={14} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers by name, URL, owner…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--pc-foreground)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Filter size={13} style={{ color: "var(--pc-muted)" }} />
          {ENV_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setEnvFilter(value)}
              style={{
                padding: "5px 12px",
                borderRadius: 14,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${envFilter === value ? ENV_CONFIG[value as keyof typeof ENV_CONFIG]?.color ?? "var(--pc-primary)" : "var(--pc-border)"}`,
                background:
                  envFilter === value
                    ? value === "all"
                      ? "rgba(45,212,167,0.1)"
                      : ENV_CONFIG[value as keyof typeof ENV_CONFIG]?.bg ?? "rgba(45,212,167,0.1)"
                    : "transparent",
                color:
                  envFilter === value
                    ? value === "all"
                      ? "var(--pc-primary)"
                      : ENV_CONFIG[value as keyof typeof ENV_CONFIG]?.color ?? "var(--pc-primary)"
                    : "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* result count */}
      {!isLoading && (
        <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 14 }}>
          Showing {filtered.length} of {servers.length} server{servers.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* grid */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        servers.length === 0 ? (
          <EmptyState
            icon={ServerIcon}
            title={EMPTY_STATES.devServers.title}
            description={EMPTY_STATES.devServers.description}
            features={[...EMPTY_STATES.devServers.features]}
            actions={[
              { label: EMPTY_STATES.devServers.primaryAction.label, href: EMPTY_STATES.devServers.primaryAction.href },
              { label: EMPTY_STATES.devServers.docsAction.label,    href: EMPTY_STATES.devServers.docsAction.href, variant: "secondary" },
            ]}
          />
        ) : (
          <FilterEmpty subject="servers" onClear={() => { setSearch(""); setEnvFilter("all"); }} />
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {filtered.map((server) => (
            <ServerCard key={server.id} server={server} onRequestAccess={setRequestSlug} />
          ))}
        </div>
      )}

      {/* legend */}
      <div style={{ marginTop: 20, display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { icon: <CheckCircle2 size={12} />, label: "Access granted — can explore tools and use playground", color: "var(--pc-primary)" },
          { icon: <Lock size={12} />, label: "Request required — submit a request to gain access", color: "var(--pc-muted)" },
          { icon: <Clock size={12} />, label: "Inactive — server is currently offline or disabled", color: "var(--pc-muted)" },
        ].map(({ icon, label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color }}>
            {icon} {label}
          </div>
        ))}
      </div>

      {/* request access modal */}
      {requestSlug && (
        <RequestAccessModal serverSlug={requestSlug} onClose={() => setRequestSlug(null)} />
      )}
    </div>
  );
}
