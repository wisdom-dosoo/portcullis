"use client";

import {
  useListPoliciesV1RateLimitPoliciesGet,
  useListRolesV1RolesGet,
  type RateLimitPolicyView,
  type RoleView,
} from "@/api/generated";
import { Zap, Shield, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ── algorithm badge ─────────────────────────────────────────────── */

function AlgoBadge({ algo }: { algo: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    sliding_window: { bg: "rgba(45,212,167,0.12)", color: "#2DD4A7" },
    fixed_window: { bg: "rgba(72,184,232,0.12)", color: "#48B8E8" },
    token_bucket: { bg: "rgba(244,185,66,0.12)", color: "#F4B942" },
  };
  const style = colorMap[algo] ?? {
    bg: "rgba(139,152,167,0.1)",
    color: "var(--pc-muted)",
  };
  return (
    <span
      className="text-xs font-mono px-2 py-0.5 rounded-md"
      style={{ background: style.bg, color: style.color }}
    >
      {algo}
    </span>
  );
}

/* ── pattern cell ────────────────────────────────────────────────── */

function PatternCell({ value }: { value?: string | null }) {
  if (!value || value === "*") {
    return (
      <span className="font-mono text-xs" style={{ color: "var(--pc-border)" }}>
        *
      </span>
    );
  }
  return (
    <code className="font-mono text-xs" style={{ color: "var(--pc-secondary)" }}>
      {value}
    </code>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminPoliciesPage() {
  const { data: policiesResp, isLoading: loadingPolicies } =
    useListPoliciesV1RateLimitPoliciesGet();
  const { data: rolesResp, isLoading: loadingRoles } = useListRolesV1RolesGet();

  const policies = (policiesResp?.data ?? []) as RateLimitPolicyView[];
  const roles = (rolesResp?.data ?? []) as RoleView[];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Policies
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Rate limiting and access control policies
        </p>
      </div>

      {/* ── Rate Limit Policies ───────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F4B942" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Rate Limit Policies
          </h2>
          {!loadingPolicies && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full tabular-nums"
              style={{ background: "rgba(244,185,66,0.12)", color: "#F4B942" }}
            >
              {policies.length}
            </span>
          )}
        </div>

        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {loadingPolicies ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 w-full rounded-lg"
                  style={{ background: "var(--pc-elevated)" }}
                />
              ))}
            </div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--pc-elevated)" }}
              >
                <Zap
                  className="w-5 h-5"
                  strokeWidth={1.5}
                  style={{ color: "var(--pc-muted)", opacity: 0.5 }}
                />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                No rate limit policies
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                Policies will appear here once created
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  <tr>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Limit
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Window
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Algorithm
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Server Pattern
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Tool Pattern
                    </th>
                    <th
                      className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Priority
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr
                      key={p.id ?? `${p.server_pattern}-${p.tool_pattern}`}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "";
                      }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Activity
                            className="w-3.5 h-3.5 flex-shrink-0"
                            strokeWidth={1.75}
                            style={{ color: "#F4B942" }}
                          />
                          <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: "var(--pc-foreground)" }}
                          >
                            {p.request_limit.toLocaleString()}
                          </span>
                          <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                            req
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-5 py-3.5 text-xs tabular-nums"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {p.window_seconds >= 3600
                          ? `${p.window_seconds / 3600}h`
                          : p.window_seconds >= 60
                          ? `${p.window_seconds / 60}m`
                          : `${p.window_seconds}s`}
                      </td>
                      <td className="px-5 py-3.5">
                        <AlgoBadge algo={p.algorithm} />
                      </td>
                      <td className="px-5 py-3.5">
                        <PatternCell value={p.server_pattern} />
                      </td>
                      <td className="px-5 py-3.5">
                        <PatternCell value={p.tool_pattern} />
                      </td>
                      <td
                        className="px-5 py-3.5 text-right text-xs tabular-nums font-medium"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {p.priority ?? <span style={{ color: "var(--pc-border)" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── RBAC Roles ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            RBAC Roles
          </h2>
          {!loadingRoles && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full tabular-nums"
              style={{ background: "rgba(45,212,167,0.12)", color: "#2DD4A7" }}
            >
              {roles.length}
            </span>
          )}
        </div>

        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {loadingRoles ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 w-full rounded-lg"
                  style={{ background: "var(--pc-elevated)" }}
                />
              ))}
            </div>
          ) : roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--pc-elevated)" }}
              >
                <Shield
                  className="w-5 h-5"
                  strokeWidth={1.5}
                  style={{ color: "var(--pc-muted)", opacity: 0.5 }}
                />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                No roles defined
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
                RBAC roles will appear here once created
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  <tr>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Name
                    </th>
                    <th
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      ID
                    </th>
                    <th
                      className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr
                      key={r.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "";
                      }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(45,212,167,0.12)" }}
                          >
                            <Shield
                              className="w-3.5 h-3.5"
                              strokeWidth={1.75}
                              style={{ color: "#2DD4A7" }}
                            />
                          </div>
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--pc-foreground)" }}
                          >
                            {r.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <code
                          className="font-mono text-xs"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {r.id}
                        </code>
                      </td>
                      <td
                        className="px-5 py-3.5 text-right text-xs tabular-nums whitespace-nowrap"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
