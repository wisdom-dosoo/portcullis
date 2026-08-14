"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Server,
  Wrench,
  Users,
  Activity,
  GitBranch,
  Trash2,
  Pencil,
  Save,
  X,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  BarChart3,
  Layers,
  FlaskConical,
  History,
  Play,
  RefreshCw,
} from "lucide-react";
import {
  useListPoliciesV1RateLimitPoliciesGet,
  useDeletePolicyV1RateLimitPoliciesPolicyIdDelete,
  useUpdatePolicyV1RateLimitPoliciesPolicyIdPatch,
  useListServersV1ServersGet,
  useListAuditLogsV1AuditGet,
  type RateLimitPolicyView,
  type AuditLogView,
  RateLimitAlgorithm,
  AuditEventType,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function humanExplain(p: RateLimitPolicyView): string {
  const subject = p.subject_id ? `Subject "${p.subject_id.slice(0, 8)}…"` : "All subjects";
  const server = p.server_pattern ? `server matching "${p.server_pattern}"` : "all servers";
  const tool = p.tool_pattern ? `tools matching "${p.tool_pattern}"` : "all tools";
  const algo = p.algorithm === RateLimitAlgorithm.sliding_window ? "sliding window" : "token bucket";
  const burst = p.burst_capacity ? ` with burst capacity of ${p.burst_capacity}` : "";
  return `${subject} may make at most ${p.request_limit} requests per ${p.window_seconds}s to ${tool} on ${server}${burst} (${algo} algorithm, priority ${p.priority}).`;
}

type TabId = "overview" | "rules" | "coverage" | "test" | "activity" | "versions";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Info size={14} /> },
  { id: "rules", label: "Rules", icon: <Shield size={14} /> },
  { id: "coverage", label: "Coverage", icon: <Layers size={14} /> },
  { id: "test", label: "Test", icon: <FlaskConical size={14} /> },
  { id: "activity", label: "Activity", icon: <Activity size={14} /> },
  { id: "versions", label: "Versions", icon: <History size={14} /> },
];

/* ── sub-components ──────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--pc-elevated)",
        border: "1px solid var(--pc-border)",
        borderRadius: 8,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? "var(--pc-foreground)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ── tab: overview ───────────────────────────────────────────────────────── */

function OverviewTab({ policy, auditLogs }: { policy: RateLimitPolicyView; auditLogs: AuditLogView[] }) {
  const toolCalls = auditLogs.filter(l => l.event_type === AuditEventType.tool_call);
  const denied = auditLogs.filter(l => l.event_type === AuditEventType.rbac_deny);
  const recentConsumers = useMemo(() => {
    const map = new Map<string, number>();
    toolCalls.forEach(l => {
      if (l.subject_id) map.set(l.subject_id, (map.get(l.subject_id) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [toolCalls]);

  return (
    <div>
      {/* Human-readable explanation */}
      <div
        style={{
          background: "linear-gradient(135deg, #2DD4A711 0%, #48B8E811 100%)",
          border: "1px solid var(--pc-primary)",
          borderRadius: 10,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <ShieldCheck size={20} style={{ color: "var(--pc-primary)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 11, color: "var(--pc-primary)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Plain-language explanation
            </div>
            <p style={{ fontSize: 15, color: "var(--pc-foreground)", lineHeight: 1.6, margin: 0 }}>
              {humanExplain(policy)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Calls" value={toolCalls.length} sub="matching server" />
        <StatCard label="Denied" value={denied.length} color={denied.length > 0 ? "var(--pc-critical)" : undefined} />
        <StatCard label="Limit" value={`${policy.request_limit} / ${policy.window_seconds}s`} />
        <StatCard label="Priority" value={policy.priority} sub="lower = higher precedence" />
      </div>

      {/* Policy metadata */}
      <Section title="Policy Details">
        <div
          style={{
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
          }}
        >
          {[
            { label: "Policy ID", value: policy.id },
            { label: "Algorithm", value: policy.algorithm === RateLimitAlgorithm.sliding_window ? "Sliding Window" : "Token Bucket" },
            { label: "Request Limit", value: `${policy.request_limit} requests` },
            { label: "Window", value: `${policy.window_seconds} seconds` },
            { label: "Burst Capacity", value: policy.burst_capacity ? `${policy.burst_capacity} requests` : "None" },
            { label: "Priority", value: policy.priority },
            { label: "Subject", value: policy.subject_id ?? "All subjects (wildcard)" },
            { label: "Server Pattern", value: policy.server_pattern ?? "* (all servers)" },
            { label: "Tool Pattern", value: policy.tool_pattern ?? "* (all tools)" },
            { label: "Created", value: new Date(policy.created_at).toLocaleString() },
            { label: "Last Updated", value: new Date(policy.updated_at).toLocaleString() },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: i < arr.length - 1 ? "1px solid var(--pc-border)" : "none",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>{row.label}</span>
              <span style={{ fontSize: 13, color: "var(--pc-foreground)", fontFamily: "monospace" }}>{String(row.value)}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Top consumers */}
      {recentConsumers.length > 0 && (
        <Section title="Top Consumers (recent activity)">
          <div
            style={{
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
            }}
          >
            {recentConsumers.map(([subjectId, count], i, arr) => (
              <div
                key={subjectId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--pc-border)" : "none",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--pc-foreground)", fontFamily: "monospace" }}>
                  {subjectId.slice(0, 12)}…
                </span>
                <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>{count} calls</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ── tab: rules ──────────────────────────────────────────────────────────── */

function RulesTab({
  policy,
  editing,
  setEditing,
  onSave,
}: {
  policy: RateLimitPolicyView;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onSave: (updates: Partial<{ request_limit: number; window_seconds: number; burst_capacity: number | null; priority: number }>) => void;
}) {
  const [limit, setLimit] = useState(String(policy.request_limit));
  const [window, setWindow] = useState(String(policy.window_seconds));
  const [burst, setBurst] = useState(String(policy.burst_capacity ?? ""));
  const [priority, setPriority] = useState(String(policy.priority));

  const inputStyle: React.CSSProperties = {
    background: "var(--pc-bg)",
    border: "1px solid var(--pc-border)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    color: "var(--pc-foreground)",
    width: "100%",
    outline: "none",
  };

  const fieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--pc-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 600,
  };

  function handleSave() {
    onSave({
      request_limit: parseInt(limit, 10) || policy.request_limit,
      window_seconds: parseInt(window, 10) || policy.window_seconds,
      burst_capacity: burst ? parseInt(burst, 10) : null,
      priority: parseInt(priority, 10) || policy.priority,
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          Configure the rate limit parameters enforced by this policy.
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--pc-foreground)",
              cursor: "pointer",
            }}
          >
            <Pencil size={12} /> Edit Rules
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setEditing(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              <X size={12} /> Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                background: "var(--pc-primary)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                color: "#0C1116",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Save size={12} /> Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Visual rule display */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Rate limit card */}
        <div
          style={{
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <BarChart3 size={16} style={{ color: "var(--pc-primary)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)" }}>Rate Limit</span>
          </div>
          {editing ? (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle}>Request Limit</label>
                <input style={inputStyle} type="number" value={limit} onChange={e => setLimit(e.target.value)} min="1" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Window (seconds)</label>
                <input style={inputStyle} type="number" value={window} onChange={e => setWindow(e.target.value)} min="1" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Burst Capacity (optional)</label>
                <input style={inputStyle} type="number" value={burst} onChange={e => setBurst(e.target.value)} min="0" placeholder="No burst" />
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>Limit</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>{policy.request_limit}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>Window</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>{policy.window_seconds}s</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>Burst</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>
                  {policy.burst_capacity ?? "None"}
                </span>
              </div>
              {/* Visual bar */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--pc-muted)", marginBottom: 4 }}>
                  <span>0</span>
                  <span>{policy.request_limit} req / {policy.window_seconds}s</span>
                </div>
                <div style={{ height: 6, background: "var(--pc-border)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (policy.request_limit / Math.max(policy.request_limit, 1000)) * 100)}%`,
                      background: "var(--pc-primary)",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Algorithm + priority card */}
        <div
          style={{
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Layers size={16} style={{ color: "var(--pc-secondary)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)" }}>Enforcement</span>
          </div>
          {editing ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Priority</label>
              <input style={inputStyle} type="number" value={priority} onChange={e => setPriority(e.target.value)} min="1" />
              <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>Lower number = evaluated first</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>Algorithm</span>
                <Badge
                  label={policy.algorithm === RateLimitAlgorithm.sliding_window ? "Sliding Window" : "Token Bucket"}
                  color="var(--pc-secondary)"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>Priority</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>{policy.priority}</span>
              </div>
              <div style={{ marginTop: 8, padding: 10, background: "var(--pc-bg)", borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>
                  {policy.algorithm === RateLimitAlgorithm.sliding_window
                    ? "Sliding window enforces a precise count over a rolling time period. More accurate but slightly higher memory usage."
                    : "Token bucket allows short bursts above the limit before throttling. Good for bursty workloads."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scope */}
      <Section title="Scope">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          {[
            {
              icon: <Users size={16} />,
              label: "Subject",
              value: policy.subject_id ?? "*",
              desc: policy.subject_id ? "Specific subject" : "All subjects",
              color: policy.subject_id ? "var(--pc-foreground)" : "var(--pc-warning)",
            },
            {
              icon: <Server size={16} />,
              label: "Server",
              value: policy.server_pattern ?? "*",
              desc: policy.server_pattern ? "Pattern match" : "All servers",
              color: policy.server_pattern ? "var(--pc-foreground)" : "var(--pc-warning)",
            },
            {
              icon: <Wrench size={16} />,
              label: "Tool",
              value: policy.tool_pattern ?? "*",
              desc: policy.tool_pattern ? "Pattern match" : "All tools",
              color: policy.tool_pattern ? "var(--pc-foreground)" : "var(--pc-warning)",
            },
          ].map(item => (
            <div
              key={item.label}
              style={{
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--pc-muted)" }}>
                {item.icon}
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{item.label}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: item.color, marginBottom: 4 }}>
                {item.value}
              </div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ── tab: coverage ───────────────────────────────────────────────────────── */

function CoverageTab({
  policy,
  servers,
}: {
  policy: RateLimitPolicyView;
  servers: Array<{ slug: string; name: string; status?: string }>;
}) {
  const matchedServers = useMemo(() => {
    if (!policy.server_pattern || policy.server_pattern === "*") return servers;
    return servers.filter(s => {
      const pattern = policy.server_pattern!.replace(/\*/g, ".*");
      try {
        return new RegExp(`^${pattern}$`).test(s.slug);
      } catch {
        return s.slug.includes(policy.server_pattern!.replace("*", ""));
      }
    });
  }, [policy, servers]);

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Info size={14} style={{ color: "var(--pc-secondary)" }} />
          <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>
            Coverage shows which registered servers match this policy's server pattern{" "}
            <code style={{ fontFamily: "monospace", color: "var(--pc-foreground)" }}>
              {policy.server_pattern ?? "*"}
            </code>
            {policy.tool_pattern && (
              <> and will apply rate limits to tools matching <code style={{ fontFamily: "monospace", color: "var(--pc-foreground)" }}>{policy.tool_pattern}</code></>
            )}.
          </p>
        </div>
      </div>

      <Section title={`Matched Servers (${matchedServers.length} of ${servers.length})`}>
        {matchedServers.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
              color: "var(--pc-muted)",
              fontSize: 13,
            }}
          >
            No registered servers match this pattern yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matchedServers.map(server => (
              <div
                key={server.slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: server.status === "healthy" ? "var(--pc-success)" : "var(--pc-muted)",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, color: "var(--pc-foreground)", fontWeight: 500 }}>{server.name}</div>
                    <div style={{ fontSize: 11, color: "var(--pc-muted)", fontFamily: "monospace" }}>{server.slug}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge
                    label={policy.tool_pattern ? `tools: ${policy.tool_pattern}` : "all tools"}
                    color="var(--pc-secondary)"
                  />
                  <Link
                    href={`/dashboard/servers/${server.slug}`}
                    style={{ fontSize: 12, color: "var(--pc-primary)", textDecoration: "none" }}
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {matchedServers.length !== servers.length && (
        <Section title={`Non-matching Servers (${servers.length - matchedServers.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {servers
              .filter(s => !matchedServers.find(m => m.slug === s.slug))
              .map(server => (
                <div
                  key={server.slug}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: "var(--pc-elevated)",
                    border: "1px solid var(--pc-border)",
                    borderRadius: 8,
                    opacity: 0.5,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--pc-border)" }} />
                    <div>
                      <div style={{ fontSize: 13, color: "var(--pc-muted)", fontWeight: 500 }}>{server.name}</div>
                      <div style={{ fontSize: 11, color: "var(--pc-muted)", fontFamily: "monospace" }}>{server.slug}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>not matched</span>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ── tab: test ───────────────────────────────────────────────────────────── */

function TestTab({ policy }: { policy: RateLimitPolicyView }) {
  const [subjectId, setSubjectId] = useState("");
  const [serverSlug, setServerSlug] = useState(policy.server_pattern?.replace(/\*/g, "example") ?? "my-server");
  const [toolName, setToolName] = useState(policy.tool_pattern?.replace(/\*/g, "read_file") ?? "read_file");
  const [result, setResult] = useState<null | { allowed: boolean; reason: string; remaining?: number }>(null);

  const inputStyle: React.CSSProperties = {
    background: "var(--pc-bg)",
    border: "1px solid var(--pc-border)",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--pc-foreground)",
    width: "100%",
    outline: "none",
  };

  function simulate() {
    // Client-side simulation based on policy parameters
    const subjectMatches = !policy.subject_id || policy.subject_id === subjectId;

    let serverMatches = true;
    if (policy.server_pattern && policy.server_pattern !== "*") {
      const pattern = policy.server_pattern.replace(/\*/g, ".*");
      try {
        serverMatches = new RegExp(`^${pattern}$`).test(serverSlug);
      } catch {
        serverMatches = serverSlug.includes(policy.server_pattern.replace("*", ""));
      }
    }

    let toolMatches = true;
    if (policy.tool_pattern && policy.tool_pattern !== "*") {
      const pattern = policy.tool_pattern.replace(/\*/g, ".*");
      try {
        toolMatches = new RegExp(`^${pattern}$`).test(toolName);
      } catch {
        toolMatches = toolName.includes(policy.tool_pattern.replace("*", ""));
      }
    }

    if (!subjectMatches) {
      setResult({ allowed: true, reason: `Policy does not apply — subject doesn't match policy scope (subject_id: ${policy.subject_id}).` });
    } else if (!serverMatches) {
      setResult({ allowed: true, reason: `Policy does not apply — server slug "${serverSlug}" does not match pattern "${policy.server_pattern}".` });
    } else if (!toolMatches) {
      setResult({ allowed: true, reason: `Policy does not apply — tool "${toolName}" does not match pattern "${policy.tool_pattern}".` });
    } else {
      setResult({
        allowed: true,
        reason: `Policy applies. Subject "${subjectId || "any"}" calling tool "${toolName}" on server "${serverSlug}" will be rate-limited to ${policy.request_limit} requests per ${policy.window_seconds}s.`,
        remaining: policy.request_limit,
      });
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>
          Simulate whether this policy would apply to a given subject, server, and tool combination.
          This is a local simulation — it checks pattern matching but does not reflect live counter state.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          { label: "Subject ID (leave blank for wildcard)", value: subjectId, set: setSubjectId, placeholder: "api_key_abc123..." },
          { label: "Server Slug", value: serverSlug, set: setServerSlug, placeholder: "my-server" },
          { label: "Tool Name", value: toolName, set: setToolName, placeholder: "read_file" },
        ].map(field => (
          <div key={field.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              {field.label}
            </label>
            <input
              style={inputStyle}
              value={field.value}
              onChange={e => field.set(e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>

      <button
        onClick={simulate}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          background: "var(--pc-primary)",
          border: "none",
          borderRadius: 6,
          fontSize: 13,
          color: "#0C1116",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        <Play size={14} /> Run Simulation
      </button>

      {result && (
        <div
          style={{
            padding: 20,
            background: result.allowed ? "#2DD4A711" : "#F05D5E11",
            border: `1px solid ${result.allowed ? "var(--pc-success)" : "var(--pc-critical)"}`,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {result.allowed ? (
              <CheckCircle2 size={18} style={{ color: "var(--pc-success)", flexShrink: 0 }} />
            ) : (
              <AlertTriangle size={18} style={{ color: "var(--pc-critical)", flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: result.allowed ? "var(--pc-success)" : "var(--pc-critical)", marginBottom: 6 }}>
                {result.allowed ? "Policy applies — request would be tracked" : "Request would be blocked"}
              </div>
              <p style={{ fontSize: 13, color: "var(--pc-foreground)", margin: 0, lineHeight: 1.6 }}>{result.reason}</p>
              {result.remaining != null && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--pc-muted)" }}>
                  Initial remaining budget: <strong style={{ color: "var(--pc-foreground)" }}>{result.remaining}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── tab: activity ───────────────────────────────────────────────────────── */

function ActivityTab({ policy, auditLogs }: { policy: RateLimitPolicyView; auditLogs: AuditLogView[] }) {
  const [filter, setFilter] = useState<"all" | "tool_call" | "rbac_deny" | "auth_failure">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return auditLogs;
    return auditLogs.filter(l => l.event_type === filter);
  }, [auditLogs, filter]);

  const eventColor: Record<string, string> = {
    tool_call: "var(--pc-success)",
    rbac_deny: "var(--pc-critical)",
    auth_failure: "var(--pc-warning)",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "tool_call", "rbac_deny", "auth_failure"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              border: "1px solid var(--pc-border)",
              background: filter === f ? "var(--pc-primary)" : "var(--pc-elevated)",
              color: filter === f ? "#0C1116" : "var(--pc-muted)",
              cursor: "pointer",
              fontWeight: filter === f ? 700 : 400,
            }}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--pc-muted)", display: "flex", alignItems: "center" }}>
          Showing events for server: <code style={{ fontFamily: "monospace", marginLeft: 6, color: "var(--pc-foreground)" }}>{policy.server_pattern ?? "*"}</code>
        </span>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            color: "var(--pc-muted)",
            fontSize: 13,
          }}
        >
          No audit events found for this policy's server scope.
        </div>
      ) : (
        <div
          style={{
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
                {["Time", "Event", "Subject", "Server", "Tool", "Outcome"].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: 11,
                      color: "var(--pc-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((log, i) => (
                <tr
                  key={log.id}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--pc-border)" : "none" }}
                >
                  <td style={{ padding: "9px 14px", fontSize: 11, color: "var(--pc-muted)", whiteSpace: "nowrap" }}>
                    {relativeTime(log.created_at)}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <Badge
                      label={log.event_type}
                      color={eventColor[log.event_type] ?? "var(--pc-muted)"}
                    />
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--pc-muted)" }}>
                    {log.subject_id ? `${log.subject_id.slice(0, 10)}…` : "—"}
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--pc-muted)" }}>
                    {log.server_slug ?? "—"}
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)" }}>
                    {log.tool_name ?? "—"}
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12 }}>
                    <span
                      style={{
                        color: log.outcome === "allowed" || log.outcome === "success"
                          ? "var(--pc-success)"
                          : "var(--pc-critical)",
                      }}
                    >
                      {log.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 50 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--pc-muted)", borderTop: "1px solid var(--pc-border)", textAlign: "center" }}>
              Showing 50 of {filtered.length} events. Use the audit log page for full history.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── tab: versions ───────────────────────────────────────────────────────── */

function VersionsTab({ policy }: { policy: RateLimitPolicyView }) {
  const mockVersions = [
    { version: "v1 (current)", date: policy.updated_at, change: "Last saved configuration", author: "you" },
    { version: "v0 (original)", date: policy.created_at, change: "Policy created", author: "you" },
  ];

  return (
    <div>
      <div
        style={{
          padding: 16,
          background: "var(--pc-elevated)",
          border: "1px solid var(--pc-border)",
          borderRadius: 8,
          marginBottom: 20,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Info size={14} style={{ color: "var(--pc-secondary)", flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>
          Full version history with rollback is coming in a future release. Portcullis currently stores the latest configuration and creation timestamp.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mockVersions.map((v, i) => (
          <div
            key={v.version}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 18px",
              background: "var(--pc-elevated)",
              border: `1px solid ${i === 0 ? "var(--pc-primary)" : "var(--pc-border)"}`,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: i === 0 ? "var(--pc-primary)" : "var(--pc-border)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)" }}>{v.version}</div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{v.change}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{relativeTime(v.date)}</div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>{new Date(v.date).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const policiesQuery = useListPoliciesV1RateLimitPoliciesGet();
  const serversQuery = useListServersV1ServersGet();

  const policy = useMemo(() => {
    const list = (policiesQuery.data?.data ?? []) as RateLimitPolicyView[];
    return list.find(p => p.id === id) ?? null;
  }, [policiesQuery.data, id]);

  // Fetch audit logs for this policy's server scope
  const serverPattern = policy?.server_pattern;
  const auditQuery = useListAuditLogsV1AuditGet(
    serverPattern && serverPattern !== "*"
      ? { server_slug: serverPattern, limit: 200 }
      : { limit: 200 },
    { query: { enabled: !!policy } }
  );

  const auditLogs = useMemo(() => (auditQuery.data?.data ?? []) as AuditLogView[], [auditQuery.data]);

  const servers = useMemo(() => {
    const raw = (serversQuery.data?.data ?? []) as Array<{ slug: string; name: string; status?: string }>;
    return raw;
  }, [serversQuery.data]);

  const deleteMutation = useDeletePolicyV1RateLimitPoliciesPolicyIdDelete({
    mutation: {
      onSuccess: () => {
        toast.success("Policy deleted");
        queryClient.invalidateQueries({ queryKey: ["/v1/rate-limit-policies"] });
        router.push("/dashboard/policies");
      },
      onError: () => toast.error("Failed to delete policy"),
    },
  });

  const updateMutation = useUpdatePolicyV1RateLimitPoliciesPolicyIdPatch({
    mutation: {
      onSuccess: () => {
        toast.success("Policy updated");
        queryClient.invalidateQueries({ queryKey: ["/v1/rate-limit-policies"] });
        setEditing(false);
      },
      onError: () => toast.error("Failed to update policy"),
    },
  });

  function handleSave(updates: Partial<{ request_limit: number; window_seconds: number; burst_capacity: number | null; priority: number }>) {
    if (!policy) return;
    updateMutation.mutate({ policyId: policy.id, data: updates });
  }

  /* ── loading ── */
  if (policiesQuery.isLoading) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <Skeleton style={{ height: 32, width: 300, marginBottom: 24 }} />
        <Skeleton style={{ height: 120, width: "100%", marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: 80 }} />)}
        </div>
      </div>
    );
  }

  /* ── not found ── */
  if (!policy) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", textAlign: "center" }}>
        <ShieldAlert size={48} style={{ color: "var(--pc-muted)", marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 8 }}>Policy not found</div>
        <p style={{ color: "var(--pc-muted)", fontSize: 13, marginBottom: 20 }}>
          The policy with ID <code style={{ fontFamily: "monospace" }}>{id}</code> does not exist or was deleted.
        </p>
        <Link
          href="/dashboard/policies"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: "var(--pc-primary)",
            color: "#0C1116",
            textDecoration: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ← Back to Policies
        </Link>
      </div>
    );
  }

  /* ── render ── */
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 12, color: "var(--pc-muted)" }}>
        <Link href="/dashboard/policies" style={{ color: "var(--pc-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={13} /> Policies
        </Link>
        <ChevronRight size={12} />
        <span style={{ color: "var(--pc-foreground)" }}>Rate Limit Policy</span>
        <ChevronRight size={12} />
        <span style={{ fontFamily: "monospace", color: "var(--pc-foreground)" }}>{policy.id.slice(0, 12)}…</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "#2DD4A722",
              border: "1px solid var(--pc-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={22} style={{ color: "var(--pc-primary)" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--pc-foreground)", margin: 0 }}>
                Rate Limit Policy
              </h1>
              <Badge label="active" color="var(--pc-success)" />
            </div>
            <div style={{ fontSize: 12, color: "var(--pc-muted)", fontFamily: "monospace" }}>
              {policy.id}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => queryClient.invalidateQueries()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--pc-muted)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "#F05D5E22",
                border: "1px solid var(--pc-critical)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--pc-critical)",
                cursor: "pointer",
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--pc-critical)" }}>Confirm?</span>
              <button
                onClick={() => deleteMutation.mutate({ policyId: policy.id })}
                disabled={deleteMutation.isPending}
                style={{
                  padding: "7px 14px",
                  background: "var(--pc-critical)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: "7px 14px",
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--pc-border)",
          marginBottom: 24,
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--pc-primary)" : "2px solid transparent",
              fontSize: 13,
              color: activeTab === tab.id ? "var(--pc-primary)" : "var(--pc-muted)",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 400,
              marginBottom: -1,
              transition: "color 0.15s",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab policy={policy} auditLogs={auditLogs} />}
      {activeTab === "rules" && (
        <RulesTab
          policy={policy}
          editing={editing}
          setEditing={setEditing}
          onSave={handleSave}
        />
      )}
      {activeTab === "coverage" && <CoverageTab policy={policy} servers={servers} />}
      {activeTab === "test" && <TestTab policy={policy} />}
      {activeTab === "activity" && <ActivityTab policy={policy} auditLogs={auditLogs} />}
      {activeTab === "versions" && <VersionsTab policy={policy} />}
    </div>
  );
}
