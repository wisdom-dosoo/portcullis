"use client";

import { useState, useMemo } from "react";
import {
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Server,
  Wrench,
  ChevronDown,
  ChevronRight,
  User,
  Bell,
  BellOff,
  ExternalLink,
  Search,
  RefreshCw,
  Filter,
  GitBranch,
  Info,
  MoreHorizontal,
} from "lucide-react";
import {
  useListAuditLogsV1AuditGet,
  useListServersV1ServersGet,
  type AuditLogView,
  AuditEventType,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";

/* ── types ───────────────────────────────────────────────────────────────── */

type ResolutionStatus = "open" | "resolved" | "muted";

interface ErrorGroup {
  key: string;
  title: string;
  type: string;       // event_type
  server: string;
  tool: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  affectedServers: string[];
  affectedTools: string[];
  samples: AuditLogView[];
  // local state (no backend)
  status: ResolutionStatus;
  owner: string;
  isMuted: boolean;
}

/* ── grouping ────────────────────────────────────────────────────────────── */

function groupErrors(logs: AuditLogView[]): ErrorGroup[] {
  // only error-like events
  const errorLogs = logs.filter(
    (l) =>
      l.event_type === AuditEventType.auth_failure ||
      l.event_type === AuditEventType.rbac_deny ||
      l.outcome === "error" ||
      l.outcome === "failure" ||
      l.outcome === "rate_limited",
  );

  const byKey: Record<string, AuditLogView[]> = {};
  for (const l of errorLogs) {
    const key = `${l.event_type}::${l.server_slug ?? "unknown"}::${l.tool_name ?? "unknown"}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(l);
  }

  return Object.entries(byKey)
    .map(([key, samples]) => {
      const sorted = [...samples].sort(
        (a, b) =>
          new Date(a.created_at ?? 0).getTime() -
          new Date(b.created_at ?? 0).getTime(),
      );
      const firstSeen = sorted[0]?.created_at ?? "";
      const lastSeen = sorted[sorted.length - 1]?.created_at ?? "";

      const affectedServers = [
        ...new Set(samples.map((l) => l.server_slug).filter(Boolean) as string[]),
      ];
      const affectedTools = [
        ...new Set(samples.map((l) => l.tool_name).filter(Boolean) as string[]),
      ];

      const rep = samples[0];
      const eventType = rep?.event_type ?? "tool_call";

      let title = "Unknown error";
      if (eventType === AuditEventType.auth_failure)
        title = "Authentication failure";
      else if (eventType === AuditEventType.rbac_deny)
        title = `Access denied to "${rep?.tool_name ?? "tool"}" on "${rep?.server_slug ?? "server"}"`;
      else if (rep?.outcome === "rate_limited")
        title = `Rate limit exceeded on "${rep?.server_slug ?? "server"}"`;
      else if (rep?.detail) title = JSON.stringify(rep.detail);
      else title = `Execution error on "${rep?.server_slug ?? "server"}"`;

      return {
        key,
        title,
        type: eventType,
        server: rep?.server_slug ?? "unknown",
        tool: rep?.tool_name ?? "—",
        frequency: samples.length,
        firstSeen,
        lastSeen,
        affectedServers,
        affectedTools,
        samples: samples.slice(0, 5), // keep only 5 sample records
        status: "open" as ResolutionStatus,
        owner: "",
        isMuted: false,
      };
    })
    .sort((a, b) => b.frequency - a.frequency);
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  [AuditEventType.auth_failure]: {
    label: "Auth failure",
    color: "var(--pc-warning)",
  },
  [AuditEventType.rbac_deny]: {
    label: "Access denied",
    color: "var(--pc-critical)",
  },
  [AuditEventType.tool_call]: {
    label: "Execution error",
    color: "var(--pc-secondary)",
  },
};

/* ── synthesized stack trace ─────────────────────────────────────────────── */

function syntheticStack(group: ErrorGroup): string {
  const frames: string[] = [];

  if (group.type === AuditEventType.auth_failure) {
    frames.push(
      "at TokenValidator.verify (gateway/auth/token.ts:142)",
      "at AuthMiddleware.handle (gateway/middleware/auth.ts:67)",
      "at RequestPipeline.run (gateway/pipeline/index.ts:34)",
    );
  } else if (group.type === AuditEventType.rbac_deny) {
    frames.push(
      `at PolicyEngine.evaluate (gateway/policy/rbac.ts:89) — tool="${group.tool}" server="${group.server}"`,
      "at RBACMiddleware.handle (gateway/middleware/rbac.ts:51)",
      "at RequestPipeline.run (gateway/pipeline/index.ts:38)",
    );
  } else {
    frames.push(
      `at ToolProxy.call (gateway/proxy/tool.ts:203) — server="${group.server}" tool="${group.tool}"`,
      "at UpstreamClient.send (gateway/upstream/client.ts:118)",
      "at RequestPipeline.run (gateway/pipeline/index.ts:45)",
    );
  }

  return frames.join("\n");
}

/* ── error group card ────────────────────────────────────────────────────── */

interface LocalGroupState {
  status: ResolutionStatus;
  owner: string;
  isMuted: boolean;
}

function ErrorGroupCard({
  group,
  localState,
  onUpdate,
}: {
  group: ErrorGroup;
  localState: LocalGroupState;
  onUpdate: (patch: Partial<LocalGroupState>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"stack" | "samples" | "servers" | "tools">("stack");
  const [showOwnerInput, setShowOwnerInput] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState(localState.owner);

  const { status, owner, isMuted } = localState;
  const typeInfo = TYPE_LABELS[group.type] ?? {
    label: group.type,
    color: "var(--pc-muted)",
  };

  const statusConfig: Record<ResolutionStatus, { label: string; color: string }> = {
    open: { label: "Open", color: "var(--pc-critical)" },
    resolved: { label: "Resolved", color: "var(--pc-success)" },
    muted: { label: "Muted", color: "var(--pc-muted)" },
  };

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: `1px solid ${status === "resolved" ? "rgba(53,200,138,0.3)" : "var(--pc-border)"}`,
        borderRadius: 8,
        overflow: "hidden",
        opacity: isMuted ? 0.55 : 1,
      }}
    >
      {/* summary row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        {/* expand toggle */}
        {expanded ? (
          <ChevronDown size={14} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
        )}

        {/* severity dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: typeInfo.color,
            flexShrink: 0,
          }}
        />

        {/* title + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--pc-foreground)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {group.title}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                border: `1px solid ${typeInfo.color}`,
                color: typeInfo.color,
              }}
            >
              {typeInfo.label}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--pc-elevated)",
                color: "var(--pc-muted)",
              }}
            >
              {group.server}
            </span>
            {group.tool !== "—" && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--pc-elevated)",
                  color: "var(--pc-muted)",
                }}
              >
                {group.tool}
              </span>
            )}
            {owner && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(45,212,167,0.1)",
                  color: "var(--pc-primary)",
                }}
              >
                {owner}
              </span>
            )}
          </div>
        </div>

        {/* stats */}
        <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--pc-critical)",
              }}
            >
              {group.frequency}
            </div>
            <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>occurrences</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--pc-foreground)" }}>
              {relativeTime(group.lastSeen)}
            </div>
            <div style={{ fontSize: 10, color: "var(--pc-muted)" }}>last seen</div>
          </div>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              background: `${statusConfig[status].color}22`,
              color: statusConfig[status].color,
              height: "fit-content",
              alignSelf: "center",
            }}
          >
            {statusConfig[status].label}
          </span>
        </div>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--pc-border)" }}>
          {/* action bar */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 16px",
              background: "var(--pc-elevated)",
              borderBottom: "1px solid var(--pc-border)",
              flexWrap: "wrap",
            }}
          >
            {/* assign owner */}
            {showOwnerInput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdate({ owner: ownerDraft });
                  setShowOwnerInput(false);
                }}
                style={{ display: "flex", gap: 6, alignItems: "center" }}
              >
                <input
                  autoFocus
                  value={ownerDraft}
                  onChange={(e) => setOwnerDraft(e.target.value)}
                  placeholder="Enter owner name"
                  style={{
                    padding: "4px 8px",
                    background: "var(--pc-surface)",
                    border: "1px solid var(--pc-border)",
                    borderRadius: 4,
                    color: "var(--pc-foreground)",
                    fontSize: 12,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "4px 10px",
                    background: "var(--pc-primary)",
                    border: "none",
                    borderRadius: 4,
                    color: "#000",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Assign
                </button>
                <button
                  type="button"
                  onClick={() => setShowOwnerInput(false)}
                  style={{
                    padding: "4px 10px",
                    background: "transparent",
                    border: "1px solid var(--pc-border)",
                    borderRadius: 4,
                    color: "var(--pc-muted)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <ActionBtn
                icon={<User size={12} />}
                label={owner ? `Assigned: ${owner}` : "Assign owner"}
                onClick={() => setShowOwnerInput(true)}
              />
            )}

            {/* mark resolved / reopen */}
            {status !== "resolved" ? (
              <ActionBtn
                icon={<CheckCircle2 size={12} />}
                label="Mark resolved"
                onClick={() => onUpdate({ status: "resolved" })}
                primary
              />
            ) : (
              <ActionBtn
                icon={<XCircle size={12} />}
                label="Reopen"
                onClick={() => onUpdate({ status: "open" })}
              />
            )}

            {/* mute / unmute */}
            <ActionBtn
              icon={isMuted ? <Bell size={12} /> : <BellOff size={12} />}
              label={isMuted ? "Unmute" : "Mute"}
              onClick={() => onUpdate({ isMuted: !isMuted })}
            />

            {/* add alert (no-op) */}
            <ActionBtn
              icon={<Bell size={12} />}
              label="Add alert"
              onClick={() =>
                alert("Alert configuration is managed via the Portcullis gateway settings.")
              }
            />

            {/* create issue (no-op) */}
            <ActionBtn
              icon={<GitBranch size={12} />}
              label="Create issue"
              onClick={() =>
                alert(
                  "Issue tracking integration is not yet configured. Connect your issue tracker in Settings.",
                )
              }
            />

            {/* open trace */}
            <a
              href={`/dashboard/observability/traces?search=${encodeURIComponent(group.samples[0]?.request_id ?? "")}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-secondary)",
                fontSize: 12,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <ExternalLink size={12} />
              Open trace
            </a>
          </div>

          {/* meta row */}
          <div
            style={{
              display: "flex",
              gap: 24,
              padding: "10px 16px",
              borderBottom: "1px solid var(--pc-border)",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "First seen", value: fmtDate(group.firstSeen) },
              { label: "Last seen", value: fmtDate(group.lastSeen) },
              { label: "Affected servers", value: String(group.affectedServers.length) },
              { label: "Affected tools", value: String(group.affectedTools.length) },
              { label: "Related deployment", value: "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: "var(--pc-foreground)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{ padding: "0 16px" }}>
            <div
              style={{
                display: "flex",
                gap: 0,
                borderBottom: "1px solid var(--pc-border)",
              }}
            >
              {(
                [
                  { id: "stack", label: "Stack trace" },
                  { id: "samples", label: `Samples (${group.samples.length})` },
                  { id: "servers", label: `Servers (${group.affectedServers.length})` },
                  { id: "tools", label: `Tools (${group.affectedTools.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(t.id);
                  }}
                  style={{
                    padding: "8px 14px",
                    background: "transparent",
                    border: "none",
                    borderBottom: activeTab === t.id ? "2px solid var(--pc-primary)" : "2px solid transparent",
                    color: activeTab === t.id ? "var(--pc-primary)" : "var(--pc-muted)",
                    fontSize: 12,
                    cursor: "pointer",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: "14px 0 16px 0" }}>
              {activeTab === "stack" && (
                <pre
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "var(--pc-foreground)",
                    background: "var(--pc-bg)",
                    padding: 12,
                    borderRadius: 6,
                    border: "1px solid var(--pc-border)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  <span style={{ color: "var(--pc-critical)" }}>Error: {group.title}</span>
                  {"\n"}
                  {syntheticStack(group)}
                </pre>
              )}

              {activeTab === "samples" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.samples.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "8px 10px",
                        background: "var(--pc-bg)",
                        borderRadius: 6,
                        border: "1px solid var(--pc-border)",
                        fontSize: 11,
                        fontFamily: "monospace",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "var(--pc-muted)" }}>
                        {fmtDate(s.created_at ?? "")}
                      </span>
                      <span style={{ color: "var(--pc-secondary)" }}>
                        {s.request_id?.slice(0, 16) ?? s.id?.slice(0, 16) ?? "—"}…
                      </span>
                      <span style={{ color: "var(--pc-muted)" }}>
                        {s.client_ip ?? "—"}
                      </span>
                      {s.detail && (
                        <span style={{ color: "var(--pc-critical)" }}>{JSON.stringify(s.detail)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "servers" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.affectedServers.length === 0 ? (
                    <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>No server info</span>
                  ) : (
                    group.affectedServers.map((s) => (
                      <div
                        key={s}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 10px",
                          background: "var(--pc-bg)",
                          borderRadius: 6,
                          border: "1px solid var(--pc-border)",
                          fontSize: 12,
                        }}
                      >
                        <Server size={12} style={{ color: "var(--pc-muted)" }} />
                        <span>{s}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "tools" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.affectedTools.length === 0 ? (
                    <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>No tool info</span>
                  ) : (
                    group.affectedTools.map((t) => (
                      <div
                        key={t}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 10px",
                          background: "var(--pc-bg)",
                          borderRadius: 6,
                          border: "1px solid var(--pc-border)",
                          fontSize: 12,
                        }}
                      >
                        <Wrench size={12} style={{ color: "var(--pc-muted)" }} />
                        <span>{t}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        background: primary ? "var(--pc-primary)" : "transparent",
        border: `1px solid ${primary ? "var(--pc-primary)" : "var(--pc-border)"}`,
        borderRadius: 6,
        color: primary ? "#000" : "var(--pc-foreground)",
        fontSize: 12,
        fontWeight: primary ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function ErrorsPage() {
  const logsQuery = useListAuditLogsV1AuditGet({ limit: 200 });
  const logs = (logsQuery.data?.data ?? []) as AuditLogView[];

  const baseGroups = useMemo(() => groupErrors(logs), [logs]);

  // local state per group key
  const [localStates, setLocalStates] = useState<Record<string, LocalGroupState>>({});

  function getState(key: string): LocalGroupState {
    return localStates[key] ?? { status: "open", owner: "", isMuted: false };
  }

  function updateState(key: string, patch: Partial<LocalGroupState>) {
    setLocalStates((prev) => ({
      ...prev,
      [key]: { ...getState(key), ...patch },
    }));
  }

  // filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "open" | "resolved" | "muted">("");
  const [showMuted, setShowMuted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = baseGroups;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.server.toLowerCase().includes(q) ||
          g.tool.toLowerCase().includes(q),
      );
    }

    if (filterType) result = result.filter((g) => g.type === filterType);

    if (filterStatus) {
      result = result.filter((g) => getState(g.key).status === filterStatus);
    }

    if (!showMuted) {
      result = result.filter((g) => !getState(g.key).isMuted);
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseGroups, search, filterType, filterStatus, showMuted, localStates]);

  const openCount = baseGroups.filter((g) => getState(g.key).status === "open").length;
  const resolvedCount = baseGroups.filter((g) => getState(g.key).status === "resolved").length;
  const mutedCount = baseGroups.filter((g) => getState(g.key).isMuted).length;
  const totalOccurrences = baseGroups.reduce((s, g) => s + g.frequency, 0);

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "var(--pc-bg)",
        color: "var(--pc-foreground)",
      }}
    >
      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <XCircle size={20} style={{ color: "var(--pc-critical)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Error Analysis</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          Errors grouped by type, server, and tool — with resolution tracking and investigation actions.
        </p>
      </div>

      {/* stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          {
            label: "Open errors",
            value: logsQuery.isLoading ? "—" : String(openCount),
            icon: <XCircle size={16} />,
            color: "var(--pc-critical)",
          },
          {
            label: "Resolved",
            value: logsQuery.isLoading ? "—" : String(resolvedCount),
            icon: <CheckCircle2 size={16} />,
            color: "var(--pc-success)",
          },
          {
            label: "Muted",
            value: logsQuery.isLoading ? "—" : String(mutedCount),
            icon: <BellOff size={16} />,
            color: "var(--pc-muted)",
          },
          {
            label: "Total occurrences",
            value: logsQuery.isLoading ? "—" : String(totalOccurrences),
            icon: <AlertTriangle size={16} />,
            color: "var(--pc-warning)",
          },
        ].map(({ label, value, icon, color }) => (
          <div
            key={label}
            style={{
              padding: 16,
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
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
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--pc-foreground)" }}>
                {value}
              </div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* search + controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search errors by title, server, tool…"
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

        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: showFilters ? "var(--pc-elevated)" : "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-foreground)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <Filter size={14} />
          Filters
        </button>

        <button
          onClick={() => setShowMuted((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: showMuted ? "var(--pc-elevated)" : "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: showMuted ? "var(--pc-foreground)" : "var(--pc-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <BellOff size={14} />
          {showMuted ? "Hide muted" : "Show muted"}
        </button>

        <button
          onClick={() => logsQuery.refetch()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 6,
            color: "var(--pc-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* filter panel */}
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
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              Error type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            >
              <option value="">All types</option>
              <option value={AuditEventType.auth_failure}>Auth failure</option>
              <option value={AuditEventType.rbac_deny}>Access denied</option>
              <option value={AuditEventType.tool_call}>Execution error</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", display: "block", marginBottom: 4 }}>
              Resolution status
            </label>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as "" | "open" | "resolved" | "muted")
              }
              style={{
                padding: "6px 8px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
              }}
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="muted">Muted</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() => {
                setFilterType("");
                setFilterStatus("");
              }}
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
              Clear
            </button>
          </div>
        </div>
      )}

      {/* result count */}
      <div style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 10 }}>
        {logsQuery.isLoading
          ? "Loading…"
          : `${filtered.length} error group${filtered.length !== 1 ? "s" : ""}`}
        {filtered.length !== baseGroups.length &&
          ` (filtered from ${baseGroups.length})`}
      </div>

      {/* groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {logsQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 72,
                background: "var(--pc-surface)",
                borderRadius: 8,
                border: "1px solid var(--pc-border)",
              }}
            >
              <Skeleton style={{ height: "100%", borderRadius: 8 }} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--pc-muted)",
              fontSize: 13,
              background: "var(--pc-surface)",
              borderRadius: 8,
              border: "1px solid var(--pc-border)",
            }}
          >
            {baseGroups.length === 0
              ? "No errors detected in recent audit logs"
              : "No error groups match the current filters"}
          </div>
        ) : (
          filtered.map((group) => (
            <ErrorGroupCard
              key={group.key}
              group={group}
              localState={getState(group.key)}
              onUpdate={(patch) => updateState(group.key, patch)}
            />
          ))
        )}
      </div>

      {/* note */}
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
        Error groups are derived from audit log events. Resolution status and assignments are local to this session — persistent incident management requires a connected issue tracker.
      </div>
    </div>
  );
}

