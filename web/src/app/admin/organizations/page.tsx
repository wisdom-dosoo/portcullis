"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useListServersV1ServersGet,
  useListApiKeysV1ApiKeysGet,
  useListPoliciesV1RateLimitPoliciesGet,
  useListRolesV1RolesGet,
  useListAuditLogsV1AuditGet,
  type ServerView,
  type ApiKeyView,
  type RateLimitPolicyView,
  type RoleView,
  type AuditLogView,
} from "@/api/generated";
import {
  Building2,
  Server,
  Key,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  X,
  Settings,
  ExternalLink,
  Globe,
  Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ── helpers ─────────────────────────────────────────────────────── */

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function outcomeConfig(outcome: string) {
  if (outcome === "allowed")
    return { icon: CheckCircle2, color: "#35C88A", bg: "rgba(53,200,138,0.12)" };
  if (outcome === "denied")
    return { icon: XCircle, color: "#F05D5E", bg: "rgba(240,93,94,0.12)" };
  return { icon: AlertTriangle, color: "#F4B942", bg: "rgba(244,185,66,0.12)" };
}

/* ── stat card ───────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number;
  loading: boolean;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <p
        className="text-xs font-medium uppercase tracking-widest mb-2"
        style={{ color: "var(--pc-muted)" }}
      >
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-8 w-14 mt-1" style={{ background: "var(--pc-elevated)" }} />
      ) : (
        <p
          className="text-3xl font-bold tabular-nums"
          style={{ color: accent ?? "var(--pc-foreground)" }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

/* ── detail drawer ───────────────────────────────────────────────── */

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  servers: ServerView[];
  apiKeys: ApiKeyView[];
  policies: RateLimitPolicyView[];
  roles: RoleView[];
  auditLogs: AuditLogView[];
  loading: boolean;
}

function OrgDetailDrawer({
  open,
  onClose,
  servers,
  apiKeys,
  policies,
  roles,
  auditLogs,
  loading,
}: DrawerProps) {
  const recentLogs = auditLogs.slice(0, 5);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          onClick={onClose}
        />
      )}

      {/* Side panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: "420px",
          background: "var(--pc-surface)",
          borderLeft: "1px solid var(--pc-border)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.4)" : "none",
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--pc-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(45,212,167,0.15)" }}
            >
              <Building2 className="w-4.5 h-4.5" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
                Default Organization
              </p>
              <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
                Organization details
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--pc-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--pc-elevated)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--pc-foreground)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--pc-muted)";
            }}
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Profile */}
          <section>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--pc-muted)" }}
            >
              Profile
            </p>
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--pc-elevated)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  Name
                </span>
                <span className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                  Default Organization
                </span>
              </div>
              <div
                className="h-px"
                style={{ background: "var(--pc-border)", opacity: 0.5 }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  Slug
                </span>
                <code className="text-xs font-mono" style={{ color: "var(--pc-primary)" }}>
                  default
                </code>
              </div>
              <div
                className="h-px"
                style={{ background: "var(--pc-border)", opacity: 0.5 }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  Region
                </span>
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3" style={{ color: "var(--pc-muted)" }} />
                  <span className="text-xs" style={{ color: "var(--pc-foreground)" }}>
                    us-east-1
                  </span>
                </div>
              </div>
              <div
                className="h-px"
                style={{ background: "var(--pc-border)", opacity: 0.5 }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  Plan
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(45,212,167,0.15)", color: "#2DD4A7" }}
                >
                  Enterprise
                </span>
              </div>
            </div>
          </section>

          {/* Usage */}
          <section>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--pc-muted)" }}
            >
              Usage
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--pc-border)" }}
            >
              {[
                {
                  label: "MCP Servers",
                  icon: Server,
                  color: "#48B8E8",
                  value: servers.length,
                  loading,
                },
                {
                  label: "API Keys",
                  icon: Key,
                  color: "#2DD4A7",
                  value: apiKeys.length,
                  loading,
                },
                {
                  label: "Rate Limit Policies",
                  icon: Zap,
                  color: "#F4B942",
                  value: policies.length,
                  loading,
                },
                {
                  label: "Roles",
                  icon: Shield,
                  color: "#F05D5E",
                  value: roles.length,
                  loading,
                },
              ].map(({ label, icon: Icon, color, value, loading: l }, idx, arr) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom:
                      idx < arr.length - 1 ? "1px solid var(--pc-border)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color }} />
                    <span className="text-xs" style={{ color: "var(--pc-foreground)" }}>
                      {label}
                    </span>
                  </div>
                  {l ? (
                    <Skeleton
                      className="h-4 w-6 rounded"
                      style={{ background: "var(--pc-border)" }}
                    />
                  ) : (
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: "var(--pc-foreground)" }}
                    >
                      {value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Recent activity */}
          <section>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--pc-muted)" }}
            >
              Recent Activity
            </p>
            <div className="space-y-2">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-10 w-full rounded-xl"
                    style={{ background: "var(--pc-elevated)" }}
                  />
                ))
              ) : recentLogs.length === 0 ? (
                <div
                  className="rounded-xl px-4 py-6 flex flex-col items-center text-center"
                  style={{ background: "var(--pc-elevated)" }}
                >
                  <Activity
                    className="w-5 h-5 mb-2"
                    strokeWidth={1.5}
                    style={{ color: "var(--pc-muted)", opacity: 0.4 }}
                  />
                  <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
                    No recent events
                  </p>
                </div>
              ) : (
                recentLogs.map((evt) => {
                  const cfg = outcomeConfig(evt.outcome);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={evt.id}
                      className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                      style={{ background: "var(--pc-elevated)" }}
                    >
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0"
                        style={{ background: cfg.bg }}
                      >
                        <Icon className="w-3 h-3" strokeWidth={2.5} style={{ color: cfg.color }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-mono truncate"
                          style={{ color: "var(--pc-foreground)" }}
                        >
                          {evt.event_type}
                        </p>
                        {evt.server_slug && (
                          <p className="text-xs truncate" style={{ color: "var(--pc-muted)" }}>
                            {evt.server_slug}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-xs tabular-nums whitespace-nowrap flex-shrink-0"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {fmtDate(evt.created_at)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Quick actions */}
          <section>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--pc-muted)" }}
            >
              Quick Actions
            </p>
            <div className="space-y-2">
              {[
                {
                  label: "Open Dashboard",
                  href: "/dashboard",
                  icon: ExternalLink,
                  color: "#2DD4A7",
                  bg: "rgba(45,212,167,0.15)",
                },
                {
                  label: "View Servers",
                  href: "/admin/servers",
                  icon: Server,
                  color: "#48B8E8",
                  bg: "rgba(72,184,232,0.15)",
                },
                {
                  label: "View Audit Logs",
                  href: "/admin/audit",
                  icon: Activity,
                  color: "#F4B942",
                  bg: "rgba(244,185,66,0.15)",
                },
                {
                  label: "Settings",
                  href: "/admin/settings",
                  icon: Settings,
                  color: "var(--pc-muted)",
                  bg: "var(--pc-elevated)",
                },
              ].map(({ label, href, icon: Icon, color, bg }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors group"
                  style={{ background: "var(--pc-elevated)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--pc-elevated)";
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: bg }}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color }} />
                  </span>
                  <span className="text-sm flex-1" style={{ color: "var(--pc-foreground)" }}>
                    {label}
                  </span>
                  <ArrowRight
                    className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--pc-primary)" }}
                  />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminOrganizationsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [search, setSearch] = useState("");

  const { data: serversResp, isLoading: loadingServers } = useListServersV1ServersGet();
  const { data: keysResp, isLoading: loadingKeys } = useListApiKeysV1ApiKeysGet();
  const { data: policiesResp, isLoading: loadingPolicies } =
    useListPoliciesV1RateLimitPoliciesGet();
  const { data: rolesResp, isLoading: loadingRoles } = useListRolesV1RolesGet();
  const { data: auditResp, isLoading: loadingAudit } = useListAuditLogsV1AuditGet({
    limit: 100,
  });

  const servers = (serversResp?.data ?? []) as ServerView[];
  const apiKeys = (keysResp?.data ?? []) as ApiKeyView[];
  const policies = (policiesResp?.data ?? []) as RateLimitPolicyView[];
  const roles = (rolesResp?.data ?? []) as RoleView[];
  const auditLogs = (auditResp?.data ?? []) as AuditLogView[];

  const loading =
    loadingServers || loadingKeys || loadingPolicies || loadingRoles || loadingAudit;

  // Derive display values for the single org row
  const firstCreatedAt = servers.length > 0
    ? servers.reduce((min, s) => (s.created_at < min ? s.created_at : min), servers[0].created_at)
    : null;

  const lastActivity = auditLogs.length > 0
    ? auditLogs.reduce(
        (max, a) => (a.created_at > max ? a.created_at : max),
        auditLogs[0].created_at
      )
    : null;

  // Filter: since there is only one org, apply filters to decide visibility
  const orgName = "Default Organization";
  const nameMatch =
    search === "" || orgName.toLowerCase().includes(search.toLowerCase());
  const planMatch = planFilter === "All" || planFilter === "Enterprise";
  const statusMatch = statusFilter === "All" || statusFilter === "Active";
  const regionMatch = regionFilter === "All" || regionFilter === "us-east-1";
  const showRow = nameMatch && planMatch && statusMatch && regionMatch;

  const planOptions = ["All", "Free", "Pro", "Enterprise"];
  const statusOptions = ["All", "Active", "Suspended", "Trial"];
  const regionOptions = ["All", "us-east-1", "eu-west-1", "ap-southeast-1"];

  return (
    <div className="space-y-8" style={{ position: "relative" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Organizations
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Manage customer organizations across the platform
          </p>
        </div>

        <div className="relative group flex-shrink-0">
          <button
            disabled
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-not-allowed opacity-40 transition-opacity"
            style={{
              background: "var(--pc-primary)",
              color: "#0C1116",
            }}
          >
            <Building2 className="w-4 h-4" strokeWidth={2} />
            New Organization
          </button>
          {/* Tooltip */}
          <div
            className="absolute right-0 top-full mt-2 w-60 rounded-xl px-3 py-2.5 text-xs leading-relaxed z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              color: "var(--pc-muted)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            This system is single-tenant. Only one organization is supported. Contact support to
            discuss multi-tenant options.
          </div>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Organizations" value={1} loading={false} />
        <StatCard label="Active" value={1} loading={false} accent="#35C88A" />
        <StatCard label="Trial" value={0} loading={false} />
        <StatCard label="Suspended" value={0} loading={false} />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4 flex flex-wrap items-center gap-3"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3 py-2"
          style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
        >
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "var(--pc-muted)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search organizations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--pc-foreground)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--pc-muted)" }}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Plan select */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Plan
          </span>
          <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid var(--pc-border)" }}>
            {planOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setPlanFilter(opt)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  planFilter === opt
                    ? { background: "var(--pc-primary)", color: "#0C1116" }
                    : {
                        background: "var(--pc-elevated)",
                        color: "var(--pc-muted)",
                      }
                }
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Status select */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Status
          </span>
          <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid var(--pc-border)" }}>
            {statusOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  statusFilter === opt
                    ? { background: "var(--pc-primary)", color: "#0C1116" }
                    : {
                        background: "var(--pc-elevated)",
                        color: "var(--pc-muted)",
                      }
                }
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Region pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Region
          </span>
          <div className="flex items-center gap-1.5">
            {regionOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setRegionFilter(opt)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={
                  regionFilter === opt
                    ? { background: "rgba(45,212,167,0.2)", color: "#2DD4A7", border: "1px solid rgba(45,212,167,0.4)" }
                    : {
                        background: "var(--pc-elevated)",
                        color: "var(--pc-muted)",
                        border: "1px solid var(--pc-border)",
                      }
                }
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Organizations table ─────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              style={{
                background: "var(--pc-elevated)",
                borderBottom: "1px solid var(--pc-border)",
              }}
            >
              <tr>
                {[
                  "Organization",
                  "Plan",
                  "MCP Servers",
                  "API Keys",
                  "Status",
                  "Created",
                  "Last Activity",
                  "",
                ].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                      i === 7 ? "text-right" : "text-left"
                    }`}
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-4">
                    <div className="space-y-3">
                      {[...Array(1)].map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-14 w-full rounded-xl"
                          style={{ background: "var(--pc-elevated)" }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : !showRow ? (
                <tr>
                  <td colSpan={8}>
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                        style={{ background: "var(--pc-elevated)" }}
                      >
                        <Building2
                          className="w-5 h-5"
                          strokeWidth={1.5}
                          style={{ color: "var(--pc-muted)", opacity: 0.5 }}
                        />
                      </div>
                      <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                        No organizations match your filters
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                        Try adjusting the filters above
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  className="transition-colors cursor-pointer group"
                  style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                  onClick={() => setDrawerOpen(true)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "";
                  }}
                >
                  {/* Organization name */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(45,212,167,0.15)" }}
                      >
                        <Building2
                          className="w-4 h-4"
                          strokeWidth={1.75}
                          style={{ color: "#2DD4A7" }}
                        />
                      </div>
                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--pc-foreground)" }}
                        >
                          Default Organization
                        </p>
                        <p className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
                          default
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Plan */}
                  <td className="px-5 py-4">
                    <span
                      className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(45,212,167,0.15)", color: "#2DD4A7" }}
                    >
                      Enterprise
                    </span>
                  </td>

                  {/* MCP Servers */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Server
                        className="w-3.5 h-3.5"
                        strokeWidth={1.75}
                        style={{ color: "#48B8E8" }}
                      />
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--pc-foreground)" }}
                      >
                        {servers.length}
                      </span>
                    </div>
                  </td>

                  {/* API Keys */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Key
                        className="w-3.5 h-3.5"
                        strokeWidth={1.75}
                        style={{ color: "#2DD4A7" }}
                      />
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--pc-foreground)" }}
                      >
                        {apiKeys.length}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(53,200,138,0.12)", color: "#35C88A" }}
                    >
                      <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                      Active
                    </span>
                  </td>

                  {/* Created */}
                  <td
                    className="px-5 py-4 text-xs tabular-nums whitespace-nowrap"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {fmtDate(firstCreatedAt)}
                  </td>

                  {/* Last activity */}
                  <td
                    className="px-5 py-4 text-xs tabular-nums whitespace-nowrap"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {fmtDateTime(lastActivity)}
                  </td>

                  {/* Actions */}
                  <td
                    className="px-5 py-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          background: "rgba(45,212,167,0.12)",
                          color: "#2DD4A7",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background =
                            "rgba(45,212,167,0.2)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background =
                            "rgba(45,212,167,0.12)";
                        }}
                      >
                        <ExternalLink className="w-3 h-3" strokeWidth={2} />
                        Open
                      </Link>
                      <Link
                        href="/admin/settings"
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          background: "var(--pc-elevated)",
                          color: "var(--pc-muted)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background =
                            "rgba(255,255,255,0.06)";
                          (e.currentTarget as HTMLAnchorElement).style.color =
                            "var(--pc-foreground)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background =
                            "var(--pc-elevated)";
                          (e.currentTarget as HTMLAnchorElement).style.color =
                            "var(--pc-muted)";
                        }}
                      >
                        <Settings className="w-3 h-3" strokeWidth={2} />
                        Settings
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {showRow && !loading && (
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--pc-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Showing 1 of 1 organization
            </p>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Single-tenant deployment
            </p>
          </div>
        )}
      </div>

      {/* ── Detail drawer ───────────────────────────────────────── */}
      <OrgDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        servers={servers}
        apiKeys={apiKeys}
        policies={policies}
        roles={roles}
        auditLogs={auditLogs}
        loading={loading}
      />
    </div>
  );
}
