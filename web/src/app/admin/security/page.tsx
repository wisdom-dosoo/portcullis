"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Lock,
  Shield,
  AlertTriangle,
  XCircle,
  Key,
  Globe,
  Activity,
  Trash2,
  Download,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  Ban,
} from "lucide-react";

import {
  useListAuditLogsV1AuditGet,
  useListApiKeysV1ApiKeysGet,
  useRevokeApiKeyV1ApiKeysKeyIdDelete,
  AuditEventType,
  type AuditLogView,
  type ApiKeyView,
} from "@/api/generated";

// ── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string | null | undefined, n = 20): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const isDenied = (e: AuditLogView) => e.outcome !== "success";

// ── skeleton ───────────────────────────────────────────────────────────────

function SkeletonBlock({ h = 24, w = "100%" }: { h?: number; w?: string }) {
  return (
    <div
      className="animate-pulse rounded"
      style={{
        height: h,
        width: w,
        background: "var(--pc-elevated)",
      }}
    />
  );
}

// ── stat card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: string;
  loading?: boolean;
}

function StatCard({ icon, label, value, accent, loading }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: "var(--pc-muted)", fontSize: 13 }}>{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      {loading ? (
        <SkeletonBlock h={32} w="60%" />
      ) : (
        <span
          className="font-bold"
          style={{ fontSize: 28, color: "var(--pc-foreground)" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

// ── event type badge ───────────────────────────────────────────────────────

function EventBadge({ type, outcome }: { type: string; outcome: string }) {
  let bg = "var(--pc-elevated)";
  let color = "var(--pc-muted)";
  let label = type;

  if (type === AuditEventType.auth_failure) {
    bg = "rgba(240,93,94,0.15)";
    color = "var(--pc-critical)";
    label = "Auth Failure";
  } else if (type === AuditEventType.rbac_deny) {
    bg = "rgba(244,185,66,0.15)";
    color = "var(--pc-warning)";
    label = "RBAC Deny";
  } else if (type === AuditEventType.tool_call && outcome !== "success") {
    bg = "rgba(244,185,66,0.10)";
    color = "var(--pc-warning)";
    label = "Blocked Call";
  } else {
    label = "Tool Call";
  }

  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

// ── main page ──────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // three separate audit log queries as specified
  const allEventsQuery = useListAuditLogsV1AuditGet({ limit: 200 });
  const authFailuresQuery = useListAuditLogsV1AuditGet({
    limit: 50,
    event_type: AuditEventType.auth_failure,
  });
  const rbacDeniesQuery = useListAuditLogsV1AuditGet({
    limit: 50,
    event_type: AuditEventType.rbac_deny,
  });
  const apiKeysQuery = useListApiKeysV1ApiKeysGet();
  const deleteMutation = useRevokeApiKeyV1ApiKeysKeyIdDelete();

  const allEvents = (allEventsQuery.data?.data ?? []) as AuditLogView[];
  const authFailures = (authFailuresQuery.data?.data ?? []) as AuditLogView[];
  const rbacDenies = (rbacDeniesQuery.data?.data ?? []) as AuditLogView[];
  const apiKeys = (apiKeysQuery.data?.data ?? []) as ApiKeyView[];

  const loading =
    allEventsQuery.isLoading ||
    authFailuresQuery.isLoading ||
    rbacDeniesQuery.isLoading;

  // ── derived stats ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const authFailureCount = authFailures.length;
    const rbacDenyCount = rbacDenies.length;
    const blockedToolCalls = allEvents.filter(
      (e) => e.event_type === AuditEventType.tool_call && isDenied(e)
    ).length;

    const deniedOrFailedEvents = allEvents.filter(
      (e) =>
        e.event_type === AuditEventType.auth_failure ||
        e.event_type === AuditEventType.rbac_deny ||
        (e.event_type === AuditEventType.tool_call && isDenied(e))
    );

    const uniqueAttackers = new Set(
      deniedOrFailedEvents.map((e) => e.client_ip).filter(Boolean)
    ).size;

    const activeApiKeys = apiKeys.filter((k) => k.last_used_at !== null).length;

    // suspicious IPs: client_ips with more than 2 auth failures
    const ipFailureCounts = new Map<string, number>();
    for (const e of authFailures) {
      if (e.client_ip) {
        ipFailureCounts.set(
          e.client_ip,
          (ipFailureCounts.get(e.client_ip) ?? 0) + 1
        );
      }
    }
    const suspiciousIPs = Array.from(ipFailureCounts.entries()).filter(
      ([, count]) => count > 2
    );

    return {
      authFailureCount,
      rbacDenyCount,
      blockedToolCalls,
      uniqueAttackers,
      activeApiKeys,
      suspiciousIPCount: suspiciousIPs.length,
      suspiciousIPs,
      deniedOrFailedEvents,
    };
  }, [allEvents, authFailures, rbacDenies, apiKeys]);

  // ── threat timeline ──────────────────────────────────────────────────────

  const timelineEvents = useMemo(() => {
    const securityEvents = allEvents.filter(
      (e) =>
        e.event_type === AuditEventType.auth_failure ||
        e.event_type === AuditEventType.rbac_deny ||
        (e.event_type === AuditEventType.tool_call && isDenied(e))
    );
    return [...securityEvents]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 50);
  }, [allEvents]);

  // ── suspicious IP table ──────────────────────────────────────────────────

  const suspiciousIPRows = useMemo(() => {
    const ipMap = new Map<
      string,
      { count: number; types: Set<string>; lastSeen: string }
    >();
    for (const e of stats.deniedOrFailedEvents) {
      if (!e.client_ip) continue;
      const existing = ipMap.get(e.client_ip);
      if (existing) {
        existing.count++;
        existing.types.add(e.event_type);
        if (e.created_at > existing.lastSeen) existing.lastSeen = e.created_at;
      } else {
        ipMap.set(e.client_ip, {
          count: 1,
          types: new Set([e.event_type]),
          lastSeen: e.created_at,
        });
      }
    }
    return Array.from(ipMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
  }, [stats.deniedOrFailedEvents]);

  // ── actions ──────────────────────────────────────────────────────────────

  async function handleRevokeKey(key: ApiKeyView) {
    setRevokingId(key.id);
    try {
      await deleteMutation.mutateAsync({ keyId: key.id });
      await queryClient.invalidateQueries({
        queryKey: ["listApiKeysV1ApiKeysGet"],
      });
      toast.success(`API key "${key.name}" revoked`);
    } catch {
      toast.error("Failed to revoke API key");
    } finally {
      setRevokingId(null);
    }
  }

  function handleBlockIP(ip: string) {
    toast.info(`IP blocking not yet configured (${ip})`);
  }

  function handleExportReport() {
    const data = {
      generated_at: new Date().toISOString(),
      total_events: timelineEvents.length,
      events: timelineEvents,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Incident report downloaded");
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen p-6 flex flex-col gap-8"
      style={{ background: "var(--pc-bg)", color: "var(--pc-foreground)" }}
    >
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Shield size={28} style={{ color: "var(--pc-primary)" }} />
          <h1
            className="font-bold text-2xl"
            style={{ color: "var(--pc-foreground)" }}
          >
            Security
          </h1>
        </div>
        <p style={{ color: "var(--pc-muted)", fontSize: 14 }}>
          Security operations, incidents, and threat monitoring
        </p>
      </div>

      {/* Stat cards — 7 cards, 4-col grid on lg */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<XCircle size={18} />}
          label="Auth Failures"
          value={stats.authFailureCount}
          accent="var(--pc-critical)"
          loading={loading}
        />
        <StatCard
          icon={<Ban size={18} />}
          label="RBAC Denies"
          value={stats.rbacDenyCount}
          accent="var(--pc-warning)"
          loading={loading}
        />
        <StatCard
          icon={<Lock size={18} />}
          label="Blocked Tool Calls"
          value={stats.blockedToolCalls}
          accent="var(--pc-warning)"
          loading={loading}
        />
        <StatCard
          icon={<Globe size={18} />}
          label="Unique Attackers"
          value={stats.uniqueAttackers}
          accent="var(--pc-critical)"
          loading={loading}
        />
        <StatCard
          icon={<Key size={18} />}
          label="API Keys Active"
          value={apiKeysQuery.isLoading ? "…" : stats.activeApiKeys}
          accent="var(--pc-success)"
          loading={apiKeysQuery.isLoading}
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="Suspicious IPs"
          value={stats.suspiciousIPCount}
          accent="var(--pc-warning)"
          loading={loading}
        />
        <StatCard
          icon={<Activity size={18} />}
          label="Open Incidents"
          value={0}
          accent="var(--pc-muted)"
          loading={false}
        />
      </div>

      {/* Threat timeline */}
      <div
        className="rounded-xl flex flex-col gap-4"
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          padding: 20,
        }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="font-semibold"
            style={{ fontSize: 16, color: "var(--pc-foreground)" }}
          >
            Threat Timeline
          </h2>
          <span style={{ color: "var(--pc-muted)", fontSize: 13 }}>
            Up to 50 recent security events
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} h={48} />
            ))}
          </div>
        ) : timelineEvents.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 gap-3"
            style={{ color: "var(--pc-muted)" }}
          >
            <CheckCircle2 size={40} style={{ color: "var(--pc-success)" }} />
            <span>No security events detected</span>
          </div>
        ) : (
          <div
            className="flex flex-col gap-2 overflow-y-auto"
            style={{ maxHeight: 480 }}
          >
            {timelineEvents.map((event) => {
              const borderColor =
                event.event_type === AuditEventType.auth_failure
                  ? "var(--pc-critical)"
                  : "var(--pc-warning)";

              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{
                    background: "var(--pc-elevated)",
                    borderLeft: `3px solid ${borderColor}`,
                  }}
                >
                  <EventBadge
                    type={event.event_type}
                    outcome={event.outcome}
                  />
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--pc-muted)", minWidth: 80 }}
                  >
                    {truncate(event.subject_id, 18)}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--pc-secondary)", minWidth: 80 }}
                  >
                    {event.server_slug ?? "—"}
                  </span>
                  <span
                    className="text-xs flex-1 truncate"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {event.tool_name ?? "—"}
                  </span>
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--pc-muted)", minWidth: 110 }}
                  >
                    {event.client_ip ?? "—"}
                  </span>
                  <span
                    className="text-xs whitespace-nowrap"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {fmtDate(event.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column grid: suspicious IPs + API key management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Suspicious IPs */}
        <div
          className="rounded-xl flex flex-col gap-4"
          style={{
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            padding: 20,
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: "var(--pc-warning)" }} />
            <h2
              className="font-semibold"
              style={{ fontSize: 16, color: "var(--pc-foreground)" }}
            >
              Top Suspicious IPs
            </h2>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} h={40} />
              ))}
            </div>
          ) : suspiciousIPRows.length === 0 ? (
            <div
              className="flex items-center justify-center py-8"
              style={{ color: "var(--pc-muted)", fontSize: 14 }}
            >
              No suspicious activity detected
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* header */}
              <div
                className="grid gap-3 px-3 py-2 text-xs font-medium"
                style={{
                  gridTemplateColumns: "1fr 56px 100px 1fr",
                  color: "var(--pc-muted)",
                  borderBottom: "1px solid var(--pc-border)",
                }}
              >
                <span>IP Address</span>
                <span>Failures</span>
                <span>Event Types</span>
                <span>Last Seen</span>
              </div>
              {suspiciousIPRows.map(([ip, info]) => (
                <div
                  key={ip}
                  className="grid gap-3 items-center px-3 py-2.5 text-sm"
                  style={{
                    gridTemplateColumns: "1fr 56px 100px 1fr",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--pc-foreground)" }}
                  >
                    {ip}
                  </span>
                  <span
                    className="font-bold text-center"
                    style={{ color: "var(--pc-critical)" }}
                  >
                    {info.count}
                  </span>
                  <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                    {Array.from(info.types)
                      .map((t) =>
                        t === AuditEventType.auth_failure
                          ? "auth"
                          : t === AuditEventType.rbac_deny
                          ? "rbac"
                          : "tool"
                      )
                      .join(", ")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {fmtDate(info.lastSeen)}
                    </span>
                    <button
                      onClick={() => handleBlockIP(ip)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80"
                      style={{
                        background: "rgba(240,93,94,0.12)",
                        color: "var(--pc-critical)",
                        border: "1px solid rgba(240,93,94,0.25)",
                      }}
                    >
                      <Ban size={11} />
                      Block
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Key management */}
        <div
          className="rounded-xl flex flex-col gap-4"
          style={{
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            padding: 20,
          }}
        >
          <div className="flex items-center gap-2">
            <Key size={16} style={{ color: "var(--pc-primary)" }} />
            <h2
              className="font-semibold"
              style={{ fontSize: 16, color: "var(--pc-foreground)" }}
            >
              API Key Management
            </h2>
          </div>

          {apiKeysQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} h={40} />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <div
              className="flex items-center justify-center py-8"
              style={{ color: "var(--pc-muted)", fontSize: 14 }}
            >
              No API keys found
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* header */}
              <div
                className="grid gap-3 px-3 py-2 text-xs font-medium"
                style={{
                  gridTemplateColumns: "1fr 80px 100px 64px",
                  color: "var(--pc-muted)",
                  borderBottom: "1px solid var(--pc-border)",
                }}
              >
                <span>Name</span>
                <span>Prefix</span>
                <span>Last Used</span>
                <span>Action</span>
              </div>
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="grid gap-3 items-center px-3 py-2.5"
                  style={{
                    gridTemplateColumns: "1fr 80px 100px 64px",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span
                      className="font-medium truncate"
                      style={{ color: "var(--pc-foreground)", fontSize: 13 }}
                    >
                      {key.name}
                    </span>
                    {key.scopes && key.scopes.length > 0 && (
                      <span
                        style={{ color: "var(--pc-muted)", fontSize: 11 }}
                        className="truncate"
                      >
                        {key.scopes.slice(0, 3).join(", ")}
                        {key.scopes.length > 3
                          ? ` +${key.scopes.length - 3}`
                          : ""}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--pc-secondary)" }}
                  >
                    {key.key_prefix}…
                  </span>
                  <span
                    className="text-xs whitespace-nowrap"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {key.last_used_at ? fmtDate(key.last_used_at) : "Never"}
                  </span>
                  <button
                    onClick={() => handleRevokeKey(key)}
                    disabled={revokingId === key.id}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{
                      background: "rgba(240,93,94,0.12)",
                      color: "var(--pc-critical)",
                      border: "1px solid rgba(240,93,94,0.25)",
                    }}
                  >
                    <Trash2 size={11} />
                    {revokingId === key.id ? "…" : "Revoke"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions bar */}
      <div
        className="rounded-xl flex flex-wrap items-center gap-3 p-4"
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
        }}
      >
        <span
          className="font-semibold text-sm mr-2"
          style={{ color: "var(--pc-muted)" }}
        >
          Quick Actions
        </span>

        <button
          onClick={handleExportReport}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: "var(--pc-elevated)",
            color: "var(--pc-foreground)",
            border: "1px solid var(--pc-border)",
          }}
        >
          <Download size={14} />
          Export Incident Report
        </button>

        <Link
          href="/admin/audit"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: "var(--pc-elevated)",
            color: "var(--pc-foreground)",
            border: "1px solid var(--pc-border)",
          }}
        >
          <ExternalLink size={14} />
          Review All Denies
          <ArrowRight size={13} />
        </Link>

        <Link
          href="/dashboard/api-keys"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: "var(--pc-elevated)",
            color: "var(--pc-foreground)",
            border: "1px solid var(--pc-border)",
          }}
        >
          <Key size={14} />
          Manage API Keys
          <ArrowRight size={13} />
        </Link>

        <Link
          href="/admin/policies"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: "var(--pc-elevated)",
            color: "var(--pc-foreground)",
            border: "1px solid var(--pc-border)",
          }}
        >
          <Shield size={14} />
          View Policies
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
