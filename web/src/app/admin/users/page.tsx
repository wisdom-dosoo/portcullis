"use client";

import { useState, useMemo } from "react";
import {
  Users,
  Key,
  Shield,
  Activity,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Clock,
} from "lucide-react";
import {
  useListApiKeysV1ApiKeysGet,
  useRevokeApiKeyV1ApiKeysKeyIdDelete,
  useListRolesV1RolesGet,
  useListAuditLogsV1AuditGet,
  type ApiKeyView,
  type RoleView,
  type AuditLogView,
} from "@/api/generated";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

/* ── helpers ──────────────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ── stat card ────────────────────────────────────────────────────── */

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  accent?: string;
  loading?: boolean;
}

function StatCard({ icon: Icon, label, value, accent, loading }: StatCardProps) {
  return (
    <div
      className="rounded-2xl border p-5 flex items-center gap-4"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "var(--pc-elevated)" }}
      >
        <Icon
          className="w-5 h-5"
          strokeWidth={1.75}
          style={{ color: accent ?? "var(--pc-muted)" }}
        />
      </div>
      <div>
        {loading ? (
          <Skeleton
            className="h-6 w-12 rounded mb-1"
            style={{ background: "var(--pc-elevated)" }}
          />
        ) : (
          <p
            className="text-xl font-bold tabular-nums"
            style={{ color: "var(--pc-foreground)" }}
          >
            {value}
          </p>
        )}
        <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

/* ── scope badge ──────────────────────────────────────────────────── */

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: "rgba(72,184,232,0.12)", color: "#48B8E8" }}
    >
      {scope}
    </span>
  );
}

/* ── outcome pill ─────────────────────────────────────────────────── */

function OutcomePill({ outcome }: { outcome: string }) {
  const cfg =
    outcome === "allowed"
      ? { icon: CheckCircle2, style: { background: "rgba(53,200,138,0.12)", color: "#35C88A" } }
      : outcome === "denied"
      ? { icon: XCircle, style: { background: "rgba(240,93,94,0.12)", color: "#F05D5E" } }
      : {
          icon: AlertTriangle,
          style: { background: "rgba(244,185,66,0.12)", color: "#F4B942" },
        };
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={cfg.style}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {outcome}
    </span>
  );
}

/* ── activity panel ───────────────────────────────────────────────── */

interface ActivityPanelProps {
  apiKey: ApiKeyView;
  logs: AuditLogView[];
  onClose: () => void;
}

function ActivityPanel({ apiKey, logs, onClose }: ActivityPanelProps) {
  const keyLogs = logs.filter((l) => l.subject_id === apiKey.id);

  return (
    <div
      className="rounded-2xl border flex flex-col overflow-hidden"
      style={{
        background: "var(--pc-surface)",
        borderColor: "var(--pc-border)",
        minWidth: 340,
        maxWidth: 420,
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: "var(--pc-border)", background: "var(--pc-elevated)" }}
      >
        <div className="flex items-center gap-2.5">
          <Activity
            className="w-4 h-4"
            strokeWidth={1.75}
            style={{ color: "var(--pc-primary)" }}
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
              {apiKey.name}
            </p>
            <p className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
              {apiKey.key_prefix}…
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: "var(--pc-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--pc-border)";
            e.currentTarget.style.color = "var(--pc-foreground)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--pc-muted)";
          }}
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 520 }}>
        {keyLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
            <Clock
              className="w-8 h-8 mb-3"
              strokeWidth={1.25}
              style={{ color: "var(--pc-muted)", opacity: 0.4 }}
            />
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              No activity yet
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              Events will appear once this key is used
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pc-border)" }}>
            {keyLogs.map((log) => (
              <div key={log.id} className="px-5 py-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: "var(--pc-foreground)" }}
                  >
                    {log.event_type}
                  </span>
                  <OutcomePill outcome={log.outcome} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {log.server_slug && (
                    <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                      <span style={{ color: "var(--pc-secondary)" }}>server</span>{" "}
                      {log.server_slug}
                    </span>
                  )}
                  {log.tool_name && (
                    <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                      <span style={{ color: "var(--pc-secondary)" }}>tool</span>{" "}
                      {log.tool_name}
                    </span>
                  )}
                  {log.client_ip && (
                    <span className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
                      {log.client_ip}
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--pc-muted)", opacity: 0.7 }}>
                  {relativeTime(log.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────── */

const inputStyle = {
  background: "var(--pc-elevated)",
  borderColor: "var(--pc-border)",
  color: "var(--pc-foreground)",
};

export default function AdminUsersPage() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [hasActivity, setHasActivity] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKeyView | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const { data: keysResp, isLoading: keysLoading } = useListApiKeysV1ApiKeysGet();
  const { data: rolesResp, isLoading: rolesLoading } = useListRolesV1RolesGet();
  const { data: logsResp, isLoading: logsLoading } = useListAuditLogsV1AuditGet({ limit: 200 });

  const apiKeys = (keysResp?.data ?? []) as ApiKeyView[];
  const roles = (rolesResp?.data ?? []) as RoleView[];
  const auditLogs = (logsResp?.data ?? []) as AuditLogView[];

  const revokeKey = useRevokeApiKeyV1ApiKeysKeyIdDelete();

  /* stat counts */
  const totalCount = apiKeys.length;
  const activeCount = apiKeys.filter((k) => k.last_used_at !== null).length;
  const neverUsedCount = apiKeys.filter((k) => k.last_used_at === null).length;
  const rolesCount = roles.length;

  /* filtered keys */
  const filteredKeys = useMemo(() => {
    return apiKeys.filter((k) => {
      const matchesSearch =
        search === "" ||
        k.name.toLowerCase().includes(search.toLowerCase()) ||
        k.key_prefix.toLowerCase().includes(search.toLowerCase());
      const matchesActivity = !hasActivity || k.last_used_at !== null;
      return matchesSearch && matchesActivity;
    });
  }, [apiKeys, search, hasActivity]);

  async function handleRevoke(key: ApiKeyView) {
    if (!confirm(`Revoke API key "${key.name}"? This cannot be undone.`)) return;
    setRevoking(key.id);
    try {
      await revokeKey.mutateAsync({ keyId: key.id });
      toast.success(`API key "${key.name}" revoked`);
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
      if (selectedKey?.id === key.id) setSelectedKey(null);
    } catch {
      toast.error("Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Users
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          API key subjects and access management
        </p>
      </div>

      {/* Context note */}
      <div
        className="rounded-xl border px-4 py-3 flex items-start gap-3"
        style={{
          background: "rgba(45,212,167,0.06)",
          borderColor: "rgba(45,212,167,0.2)",
        }}
      >
        <Key
          className="w-4 h-4 mt-0.5 shrink-0"
          strokeWidth={1.75}
          style={{ color: "var(--pc-primary)" }}
        />
        <p className="text-sm leading-relaxed" style={{ color: "var(--pc-muted)" }}>
          This gateway is{" "}
          <span style={{ color: "var(--pc-foreground)" }}>single-tenant</span> — user subjects
          are represented by{" "}
          <span style={{ color: "var(--pc-foreground)" }}>API keys</span>. Each key below
          corresponds to a unique subject that can authenticate and access MCP tools based on
          its assigned scopes.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Subjects"
          value={totalCount}
          accent="var(--pc-primary)"
          loading={keysLoading}
        />
        <StatCard
          icon={CheckCircle2}
          label="Active"
          value={activeCount}
          accent="#35C88A"
          loading={keysLoading}
        />
        <StatCard
          icon={Clock}
          label="Never Used"
          value={neverUsedCount}
          accent="var(--pc-warning)"
          loading={keysLoading}
        />
        <StatCard
          icon={Shield}
          label="Roles"
          value={rolesCount}
          accent="var(--pc-secondary)"
          loading={rolesLoading}
        />
      </div>

      {/* Search + filter bar */}
      <div
        className="rounded-2xl border p-4 flex flex-wrap gap-3 items-center"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            strokeWidth={2}
            style={{ color: "var(--pc-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or key prefix…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border outline-none"
            style={inputStyle}
          />
        </div>

        {/* Has Activity toggle */}
        <button
          onClick={() => setHasActivity((v) => !v)}
          className="inline-flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border transition-all"
          style={
            hasActivity
              ? {
                  background: "rgba(45,212,167,0.12)",
                  borderColor: "rgba(45,212,167,0.35)",
                  color: "var(--pc-primary)",
                }
              : {
                  background: "var(--pc-elevated)",
                  borderColor: "var(--pc-border)",
                  color: "var(--pc-muted)",
                }
          }
        >
          <Activity className="w-3.5 h-3.5" strokeWidth={1.75} />
          Has Activity
        </button>
      </div>

      {/* Main content: table + optional side panel */}
      <div className="flex gap-4 items-start">
        {/* Users table */}
        <div
          className="flex-1 rounded-2xl border overflow-hidden min-w-0"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {keysLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-12 w-full rounded-lg"
                  style={{ background: "var(--pc-elevated)" }}
                />
              ))}
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--pc-elevated)" }}
              >
                <Key
                  className="w-5 h-5"
                  strokeWidth={1.5}
                  style={{ color: "var(--pc-muted)" }}
                />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                No API keys found
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                {search || hasActivity
                  ? "Try adjusting your search or filters"
                  : "Create an API key to get started"}
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
                      Subject
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Scopes
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Last Active
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Created
                    </th>
                    <th
                      className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((key, idx) => {
                    const isSelected = selectedKey?.id === key.id;
                    const isLastRow = idx === filteredKeys.length - 1;
                    return (
                      <tr
                        key={key.id}
                        onClick={() => setSelectedKey(isSelected ? null : key)}
                        className="cursor-pointer transition-colors"
                        style={{
                          borderBottom: isLastRow ? "none" : "1px solid var(--pc-border)",
                          background: isSelected ? "rgba(45,212,167,0.05)" : undefined,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = "";
                        }}
                      >
                        {/* Subject */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: "var(--pc-elevated)" }}
                            >
                              <Key
                                className="w-3.5 h-3.5"
                                strokeWidth={1.75}
                                style={{ color: "var(--pc-primary)" }}
                              />
                            </div>
                            <div>
                              <p
                                className="font-medium text-sm"
                                style={{ color: "var(--pc-foreground)" }}
                              >
                                {key.name}
                              </p>
                              <p
                                className="text-xs font-mono"
                                style={{ color: "var(--pc-muted)" }}
                              >
                                {key.key_prefix}…
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Scopes */}
                        <td className="px-5 py-3.5">
                          {key.scopes.length === 0 ? (
                            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                              —
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {key.scopes.slice(0, 3).map((s) => (
                                <ScopeBadge key={s} scope={s} />
                              ))}
                              {key.scopes.length > 3 && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{
                                    background: "var(--pc-elevated)",
                                    color: "var(--pc-muted)",
                                  }}
                                >
                                  +{key.scopes.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Last Active */}
                        <td className="px-5 py-3.5">
                          <span
                            className="text-sm tabular-nums"
                            style={{
                              color: key.last_used_at
                                ? "var(--pc-foreground)"
                                : "var(--pc-muted)",
                            }}
                          >
                            {relativeTime(key.last_used_at)}
                          </span>
                        </td>

                        {/* Created */}
                        <td className="px-5 py-3.5">
                          <span
                            className="text-sm tabular-nums"
                            style={{ color: "var(--pc-muted)" }}
                          >
                            {formatDate(key.created_at)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevoke(key);
                            }}
                            disabled={revoking === key.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"
                            style={{
                              background: "rgba(240,93,94,0.08)",
                              borderColor: "rgba(240,93,94,0.25)",
                              color: "#F05D5E",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(240,93,94,0.16)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(240,93,94,0.08)";
                            }}
                          >
                            <Trash2 className="w-3 h-3" strokeWidth={2} />
                            {revoking === key.id ? "Revoking…" : "Revoke"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity side panel — loading skeleton */}
        {selectedKey && logsLoading && (
          <div
            className="rounded-2xl border p-5 space-y-3"
            style={{
              background: "var(--pc-surface)",
              borderColor: "var(--pc-border)",
              minWidth: 340,
            }}
          >
            {[...Array(4)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-10 w-full rounded-lg"
                style={{ background: "var(--pc-elevated)" }}
              />
            ))}
          </div>
        )}

        {/* Activity side panel — populated */}
        {selectedKey && !logsLoading && (
          <ActivityPanel
            apiKey={selectedKey}
            logs={auditLogs}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>

      {/* Roles section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield
            className="w-4 h-4"
            strokeWidth={1.75}
            style={{ color: "var(--pc-secondary)" }}
          />
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--pc-foreground)" }}
          >
            Roles
          </h2>
          {!rolesLoading && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
            >
              {roles.length}
            </span>
          )}
        </div>

        {rolesLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-20 w-full rounded-2xl"
                style={{ background: "var(--pc-elevated)" }}
              />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div
            className="rounded-2xl border p-8 flex flex-col items-center justify-center text-center"
            style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
          >
            <Shield
              className="w-8 h-8 mb-3"
              strokeWidth={1.25}
              style={{ color: "var(--pc-muted)", opacity: 0.4 }}
            />
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              No roles defined
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              Create roles to group permissions for API key subjects
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-2xl border px-5 py-4 flex items-center gap-3"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(72,184,232,0.1)" }}
                >
                  <Shield
                    className="w-4 h-4"
                    strokeWidth={1.75}
                    style={{ color: "#48B8E8" }}
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--pc-foreground)" }}
                  >
                    {role.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                    Created {formatDate(role.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
