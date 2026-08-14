"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Plus,
  Trash2,
  Zap,
  Users,
  Search,
  Filter,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  Eye,
} from "lucide-react";
import {
  useListPoliciesV1RateLimitPoliciesGet,
  useDeletePolicyV1RateLimitPoliciesPolicyIdDelete,
  useListRolesV1RolesGet,
  type RateLimitPolicyView,
  type RoleView,
  RateLimitAlgorithm,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, FilterEmpty, EMPTY_STATES } from "@/components/empty-state";

/* ── types ───────────────────────────────────────────────────────── */

interface UnifiedPolicy {
  id: string;
  type: "rate-limit" | "rbac";
  name: string;
  effect: "rate-limit" | "allow" | "deny";
  subjects: string;
  tools: string;
  server: string;
  priority: number;
  status: "active" | "disabled";
  updatedAt: string;
  raw: RateLimitPolicyView | RoleView;
}

/* ── helpers ─────────────────────────────────────────────────────── */

function humanExplain(p: UnifiedPolicy): string {
  if (p.type === "rate-limit") {
    const rl = p.raw as RateLimitPolicyView;
    const subject = rl.subject_id ? `Subject "${rl.subject_id.slice(0, 8)}…"` : "All subjects";
    const server = rl.server_pattern ? `server "${rl.server_pattern}"` : "all servers";
    const tool = rl.tool_pattern ? `tools matching "${rl.tool_pattern}"` : "all tools";
    const algo = rl.algorithm === RateLimitAlgorithm.sliding_window ? "sliding window" : "token bucket";
    return `${subject} may make at most ${rl.request_limit} requests per ${rl.window_seconds}s to ${tool} on ${server} (${algo}).`;
  }
  return `Members assigned to role "${p.name}" have access controlled by tool permissions configured on this role.`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function patternBreadth(pattern: string | null): "broad" | "normal" {
  if (!pattern || pattern === "*") return "broad";
  return "normal";
}

/* ── sub-components ──────────────────────────────────────────────── */

function EffectPill({ effect }: { effect: UnifiedPolicy["effect"] }) {
  const cfg = {
    "rate-limit": { bg: "rgba(72,184,232,0.12)", color: "#48B8E8", icon: Zap, label: "Rate Limit" },
    allow:        { bg: "rgba(53,200,138,0.12)",  color: "#35C88A", icon: CheckCircle2, label: "Allow" },
    deny:         { bg: "rgba(240,93,94,0.12)",   color: "#F05D5E", icon: XCircle,      label: "Deny"  },
  }[effect];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={11} strokeWidth={2.5} />{cfg.label}
    </span>
  );
}

function StatusPill({ status }: { status: "active" | "disabled" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={status === "active"
        ? { background: "rgba(45,212,167,0.12)", color: "#2DD4A7" }
        : { background: "rgba(139,152,167,0.1)", color: "var(--pc-muted)" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: status === "active" ? "#2DD4A7" : "var(--pc-muted)", display: "inline-block" }} />
      {status}
    </span>
  );
}

function HealthCard({ label, value, color, icon: Icon, sub }: {
  label: string; value: number; color: string; icon: React.ElementType; sub?: string;
}) {
  return (
    <div className="rounded-2xl border p-5" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pc-muted)" }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + "20" }}>
          <Icon size={15} strokeWidth={1.75} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--pc-foreground)" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>{sub}</p>}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function PoliciesPage() {
  const qc = useQueryClient();
  const { data: rlResp, isLoading: rlLoading } = useListPoliciesV1RateLimitPoliciesGet();
  const { data: rolesResp, isLoading: rolesLoading } = useListRolesV1RolesGet();

  const rlPolicies = (rlResp?.data ?? []) as RateLimitPolicyView[];
  const roles = (rolesResp?.data ?? []) as RoleView[];

  const deletePolicy = useDeletePolicyV1RateLimitPoliciesPolicyIdDelete();

  const [search, setSearch] = useState("");
  const [filterEffect, setFilterEffect] = useState<"all" | "rate-limit" | "allow" | "deny">("all");
  const [filterType, setFilterType] = useState<"all" | "rate-limit" | "rbac">("all");

  /* build unified list */
  const unified = useMemo<UnifiedPolicy[]>(() => {
    const rl: UnifiedPolicy[] = rlPolicies.map((p) => ({
      id: p.id,
      type: "rate-limit",
      name: p.subject_id ? `Rate limit: ${p.subject_id.slice(0, 8)}…` : `Global rate limit`,
      effect: "rate-limit",
      subjects: p.subject_id ?? "all",
      tools: p.tool_pattern ?? "*",
      server: p.server_pattern ?? "*",
      priority: p.priority,
      status: "active",
      updatedAt: p.updated_at,
      raw: p,
    }));
    const rbac: UnifiedPolicy[] = roles.map((r) => ({
      id: r.id,
      type: "rbac",
      name: r.name,
      effect: "allow",
      subjects: "role members",
      tools: "*",
      server: "*",
      priority: 0,
      status: "active",
      updatedAt: r.created_at,
      raw: r,
    }));
    return [...rl, ...rbac];
  }, [rlPolicies, roles]);

  /* health summary */
  const broadPolicies = unified.filter((p) => p.type === "rate-limit" && (patternBreadth((p.raw as RateLimitPolicyView).tool_pattern) === "broad" || patternBreadth((p.raw as RateLimitPolicyView).server_pattern) === "broad")).length;
  const activePolicies = unified.filter((p) => p.status === "active").length;

  /* filter */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return unified.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.tools.toLowerCase().includes(q) && !p.server.toLowerCase().includes(q)) return false;
      if (filterEffect !== "all" && p.effect !== filterEffect) return false;
      if (filterType !== "all" && p.type !== filterType) return false;
      return true;
    });
  }, [unified, search, filterEffect, filterType]);

  async function handleDeleteRL(id: string) {
    if (!confirm("Delete this rate limit policy?")) return;
    try {
      await deletePolicy.mutateAsync({ policyId: id });
      toast.success("Policy deleted");
      qc.invalidateQueries({ queryKey: ["/v1/rate-limit-policies"] });
    } catch { toast.error("Failed to delete policy"); }
  }

  const isLoading = rlLoading || rolesLoading;
  const selStyle: React.CSSProperties = {
    background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 12, color: "var(--pc-foreground)", outline: "none", cursor: "pointer",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>Policy Management</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Rate limit policies, RBAC rules, and access controls for your gateway
          </p>
        </div>
        <Link
          href="/dashboard/policies/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Plus size={15} strokeWidth={2.5} /> New Policy
        </Link>
      </div>

      {/* Health summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <HealthCard label="Active Policies"    value={activePolicies} color="#2DD4A7" icon={ShieldCheck} sub={`${unified.length} total`} />
        <HealthCard label="Rate Limit Rules"   value={rlPolicies.length} color="#48B8E8" icon={Zap} />
        <HealthCard label="RBAC Roles"         value={roles.length} color="#F4B942" icon={Users} sub="with tool permissions" />
        <HealthCard label="Overly Broad"       value={broadPolicies} color={broadPolicies > 0 ? "#F4B942" : "#35C88A"} icon={broadPolicies > 0 ? AlertTriangle : ShieldCheck} sub="wildcard patterns" />
        <HealthCard label="Disabled"           value={0} color="#8B98A7" icon={ShieldOff} sub="no disabled policies" />
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border px-4 py-3 flex items-center gap-3 flex-wrap"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
        <Filter size={13} strokeWidth={1.75} style={{ color: "var(--pc-muted)" }} />
        <div style={{ position: "relative", flexGrow: 1, minWidth: 160 }}>
          <Search size={12} strokeWidth={1.75} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--pc-muted)" }} />
          <input type="text" placeholder="Search policies…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...selStyle, paddingLeft: 28, width: "100%" }} />
        </div>
        <select value={filterEffect} onChange={(e) => setFilterEffect(e.target.value as typeof filterEffect)} style={selStyle}>
          <option value="all">All Effects</option>
          <option value="rate-limit">Rate Limit</option>
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} style={selStyle}>
          <option value="all">All Types</option>
          <option value="rate-limit">Rate Limit</option>
          <option value="rbac">RBAC</option>
        </select>
        <span className="text-xs ml-auto" style={{ color: "var(--pc-muted)" }}>
          <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>{filtered.length}</span> {filtered.length === 1 ? "policy" : "policies"}
        </span>
      </div>

      {/* Policy table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
        {isLoading ? (
          <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" style={{ background: "var(--pc-elevated)" }} />)}</div>
        ) : filtered.length === 0 ? (
          unified.length === 0 ? (
            <EmptyState
              icon={Shield}
              title={EMPTY_STATES.policies.title}
              description={EMPTY_STATES.policies.description}
              features={[...EMPTY_STATES.policies.features]}
              actions={[
                { label: EMPTY_STATES.policies.primaryAction.label, href: EMPTY_STATES.policies.primaryAction.href },
                { label: EMPTY_STATES.policies.docsAction.label,    href: EMPTY_STATES.policies.docsAction.href, variant: "secondary" },
              ]}
            />
          ) : (
            <FilterEmpty subject="policies" onClear={() => {}} />
          )
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
              <tr>
                {["Policy", "Effect", "Subjects", "Tools", "Server", "Priority", "Status", "Updated", ""].map((h, i) => (
                  <th key={h + i} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${i === 8 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--pc-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const explanation = humanExplain(p);
                const isBroad = p.type === "rate-limit" && (patternBreadth((p.raw as RateLimitPolicyView).tool_pattern) === "broad" || patternBreadth((p.raw as RateLimitPolicyView).server_pattern) === "broad");
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <td className="px-4 py-3.5 max-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: p.type === "rate-limit" ? "rgba(72,184,232,0.12)" : "rgba(45,212,167,0.12)" }}>
                          {p.type === "rate-limit"
                            ? <Zap size={13} strokeWidth={1.75} style={{ color: "#48B8E8" }} />
                            : <Shield size={13} strokeWidth={1.75} style={{ color: "#2DD4A7" }} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--pc-foreground)" }}>{p.name}</p>
                          <p className="text-xs truncate" style={{ color: "var(--pc-muted)", maxWidth: 180 }} title={explanation}>{explanation}</p>
                        </div>
                      </div>
                      {isBroad && (
                        <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "#F4B942" }}>
                          <AlertTriangle size={10} strokeWidth={2} /> Broad pattern
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5"><EffectPill effect={p.effect} /></td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono truncate max-w-[80px] block" style={{ color: "var(--pc-muted)" }}>{p.subjects}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <code className="text-xs font-mono" style={{ color: "var(--pc-secondary)" }}>{p.tools}</code>
                    </td>
                    <td className="px-4 py-3.5">
                      <code className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>{p.server}</code>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>{p.priority}</span>
                    </td>
                    <td className="px-4 py-3.5"><StatusPill status={p.status} /></td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs" style={{ color: "var(--pc-muted)" }}>{relativeTime(p.updatedAt)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseEnter={(e) => ((e.currentTarget.closest("tr") as HTMLElement).style.background = "rgba(255,255,255,0.02)")}
                      >
                        {p.type === "rate-limit" ? (
                          <>
                            <Link href={`/dashboard/policies/${p.id}`} className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--pc-primary)" }}>
                              <Eye size={11} strokeWidth={2} /> View
                            </Link>
                            <button onClick={() => handleDeleteRL(p.id)} className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--pc-critical)", background: "none", border: "none", cursor: "pointer" }}>
                              <Trash2 size={11} strokeWidth={1.75} /> Delete
                            </button>
                          </>
                        ) : (
                          <Link href="/dashboard/roles" className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--pc-muted)" }}>
                            <ChevronRight size={11} strokeWidth={2} /> Manage in Roles
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info footer */}
      <div className="rounded-2xl border px-5 py-4 flex items-start gap-3"
        style={{ background: "rgba(72,184,232,0.05)", borderColor: "rgba(72,184,232,0.15)" }}>
        <GitBranch size={14} strokeWidth={1.75} style={{ color: "#48B8E8", flexShrink: 0, marginTop: 2 }} />
        <div className="text-sm" style={{ color: "var(--pc-muted)", lineHeight: 1.65 }}>
          <span style={{ color: "var(--pc-foreground)", fontWeight: 500 }}>Policy evaluation order:</span>
          {" "}Rate limit policies are checked first (by priority). RBAC tool permissions are evaluated per role binding. Deny rules take precedence over allow rules within the same priority tier.
          {" "}<Link href="/dashboard/policies/new" style={{ color: "var(--pc-primary)" }}>Create a policy →</Link>
        </div>
      </div>
    </div>
  );
}
