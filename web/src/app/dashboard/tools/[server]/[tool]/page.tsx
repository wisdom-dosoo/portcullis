"use client";

import { useState, use, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetServerV1ServersSlugGet,
  useListAuditLogsV1AuditGet,
  useListRolesV1RolesGet,
  useListPoliciesV1RateLimitPoliciesGet,
  type ServerView,
  type AuditLogView,
  type RoleView,
  type RateLimitPolicyView,
} from "@/api/generated";
import { getToken } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Wrench,
  Server,
  ShieldAlert,
  ShieldCheck,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  BarChart2,
  Lock,
  Users,
  ChevronRight,
  Copy,
  Clock,
  Info,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Types ───────────────────────────────────────────────────────────── */

type Tab = "documentation" | "schema" | "access" | "usage" | "security";

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<
      string,
      { type?: string; description?: string; enum?: unknown[]; properties?: unknown }
    >;
    required?: string[];
  };
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function getRiskLevel(
  toolName: string
): "low" | "medium" | "high" | "critical" {
  const n = toolName.toLowerCase();
  if (/delete|drop|destroy|truncate|purge|wipe|remove|kill/.test(n))
    return "critical";
  if (/create|write|update|modify|patch|post|insert|execute|run|send/.test(n))
    return "high";
  if (/search|query|list|find/.test(n)) return "medium";
  return "low";
}

function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return pattern === value;
}

function getUseCases(toolName: string): string[] {
  const n = toolName.toLowerCase();
  if (/search/.test(n))
    return [
      `Search for resources matching specific criteria using ${toolName}`,
      `Filter and discover items by keyword or attribute`,
    ];
  if (/create|add|new/.test(n))
    return [
      `Create new resources via ${toolName}`,
      `Provision and initialize entities programmatically`,
    ];
  if (/delete|remove/.test(n))
    return [
      `Remove existing resources using ${toolName}`,
      `Clean up stale or unwanted data entries`,
    ];
  if (/update|modify|patch/.test(n))
    return [
      `Update existing resource attributes with ${toolName}`,
      `Apply targeted changes to specific fields`,
    ];
  if (/list|get|fetch|read/.test(n))
    return [
      `Retrieve and inspect resources via ${toolName}`,
      `Read current state for reporting or decision-making`,
    ];
  if (/send|push|publish|emit/.test(n))
    return [
      `Dispatch data or notifications using ${toolName}`,
      `Trigger downstream processes by emitting events`,
    ];
  return [
    `Invoke ${toolName} to perform its designated operation`,
    `Integrate ${toolName} into automated workflows`,
  ];
}

function getDataAccess(toolName: string): string {
  const n = toolName.toLowerCase();
  if (/file|path|dir|folder|disk/.test(n)) return "File system access";
  if (/db|sql|database|postgres|mysql|sqlite|mongo/.test(n))
    return "Database access";
  if (/email|mail|smtp|inbox/.test(n)) return "Email / messaging access";
  if (/api|http|request|fetch|url|endpoint/.test(n))
    return "External API access";
  return "Unknown — review tool implementation";
}

/* ── Risk Badge ──────────────────────────────────────────────────────── */

function RiskBadge({
  level,
  large,
}: {
  level: "low" | "medium" | "high" | "critical";
  large?: boolean;
}) {
  const configs = {
    critical: {
      color: "#F05D5E",
      bg: "rgba(240,93,94,0.12)",
      icon: ShieldAlert,
      label: "Critical",
    },
    high: {
      color: "#F4B942",
      bg: "rgba(244,185,66,0.12)",
      icon: AlertTriangle,
      label: "High",
    },
    medium: {
      color: "#48B8E8",
      bg: "rgba(72,184,232,0.12)",
      icon: Shield,
      label: "Medium",
    },
    low: {
      color: "#35C88A",
      bg: "rgba(53,200,138,0.12)",
      icon: ShieldCheck,
      label: "Low",
    },
  };
  const { color, bg, icon: Icon, label } = configs[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${
        large ? "text-sm px-3 py-1.5" : "text-xs px-2.5 py-1"
      }`}
      style={{ background: bg, color }}
    >
      <Icon className={large ? "w-4 h-4" : "w-3 h-3"} strokeWidth={2} />
      {label} Risk
    </span>
  );
}

/* ── Status Badge ────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  const color = active ? "#2DD4A7" : "#8B98A7";
  const bg = active ? "rgba(45,212,167,0.12)" : "rgba(139,152,167,0.1)";
  const Icon = active ? CheckCircle2 : XCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: bg, color }}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {status}
    </span>
  );
}

/* ── Tab Button ──────────────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
      style={
        active
          ? {
              background: "rgba(45,212,167,0.12)",
              color: "var(--pc-primary)",
            }
          : { color: "var(--pc-muted)" }
      }
    >
      {children}
    </button>
  );
}

/* ── Section Card ────────────────────────────────────────────────────── */

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-6 space-y-4"
      style={{
        background: "var(--pc-surface)",
        borderColor: "var(--pc-border)",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Type Badge ──────────────────────────────────────────────────────── */

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { color: string; bg: string }> = {
    string: { color: "#2DD4A7", bg: "rgba(45,212,167,0.12)" },
    number: { color: "#F4B942", bg: "rgba(244,185,66,0.12)" },
    integer: { color: "#F4B942", bg: "rgba(244,185,66,0.12)" },
    boolean: { color: "#48B8E8", bg: "rgba(72,184,232,0.12)" },
    object: { color: "#8B98A7", bg: "rgba(139,152,167,0.1)" },
    array: { color: "#8B98A7", bg: "rgba(139,152,167,0.1)" },
  };
  const style = colors[type] ?? { color: "var(--pc-muted)", bg: "var(--pc-elevated)" };
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded font-mono"
      style={{ background: style.bg, color: style.color }}
    >
      {type}
    </span>
  );
}

/* ── Documentation Tab ───────────────────────────────────────────────── */

function DocumentationTab({ tool }: { tool: McpTool | null }) {
  const properties = tool?.inputSchema?.properties ?? {};
  const required = tool?.inputSchema?.required ?? [];
  const useCases = tool ? getUseCases(tool.name) : [];

  return (
    <div className="space-y-4">
      {/* Description */}
      <SectionCard
        title="Description"
        subtitle="What this tool does"
      >
        <p className="text-sm leading-relaxed" style={{ color: "var(--pc-foreground)" }}>
          {tool?.description ?? "No description provided by this tool."}
        </p>
        {useCases.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--pc-muted)" }}>
              Use Cases
            </p>
            <ul className="space-y-1.5">
              {useCases.map((uc, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ChevronRight
                    className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                    style={{ color: "var(--pc-primary)" }}
                    strokeWidth={2}
                  />
                  <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                    {uc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {/* Input Parameters */}
      <SectionCard
        title="Input Parameters"
        subtitle="Arguments accepted by this tool"
      >
        {Object.keys(properties).length === 0 ? (
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            No parameters — this tool takes no input.
          </p>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--pc-border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  {["Parameter", "Type", "Required", "Description"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.entries(properties).map(([name, schema], i, arr) => {
                  const isReq = required.includes(name);
                  const s = schema as {
                    type?: string;
                    description?: string;
                    enum?: unknown[];
                  };
                  return (
                    <tr
                      key={name}
                      style={
                        i < arr.length - 1
                          ? { borderBottom: "1px solid var(--pc-border)" }
                          : {}
                      }
                    >
                      <td className="px-4 py-3">
                        <code
                          className="text-xs font-mono font-semibold"
                          style={{ color: "var(--pc-secondary)" }}
                        >
                          {name}
                          {isReq && (
                            <span style={{ color: "#F05D5E" }}> *</span>
                          )}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {s.type ? (
                          <TypeBadge type={s.type} />
                        ) : (
                          <span
                            className="text-xs"
                            style={{ color: "var(--pc-muted)" }}
                          >
                            unknown
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isReq ? (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{
                              background: "rgba(53,200,138,0.12)",
                              color: "#35C88A",
                            }}
                          >
                            required
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{
                              background: "rgba(139,152,167,0.1)",
                              color: "var(--pc-muted)",
                            }}
                          >
                            optional
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {s.description ?? (
                          <span style={{ color: "var(--pc-border)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Limitations */}
      <SectionCard
        title="Limitations"
        subtitle="Known constraints and caveats"
      >
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
          }}
        >
          <Info
            className="w-4 h-4 mt-0.5 flex-shrink-0"
            style={{ color: "var(--pc-muted)" }}
            strokeWidth={1.75}
          />
          <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Limitations are not provided by the MCP protocol. Consult the
            tool&apos;s documentation or server maintainer for edge cases, rate
            limits, and known issues.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

/* ── Schema Tab ──────────────────────────────────────────────────────── */

function SchemaTab({ tool }: { tool: McpTool | null }) {
  const schema = tool?.inputSchema ?? null;
  const properties = schema?.properties ?? {};
  const required = schema?.required ?? [];

  function handleCopy() {
    if (!schema) return;
    navigator.clipboard
      .writeText(JSON.stringify(schema, null, 2))
      .then(() => toast.success("Schema copied"))
      .catch(() => toast.error("Copy failed"));
  }

  // Build validation rules
  const validationRules: string[] = [];
  for (const [name, s] of Object.entries(properties)) {
    const sc = s as {
      type?: string;
      description?: string;
      enum?: unknown[];
    };
    if (required.includes(name)) {
      validationRules.push(`"${name}" is required`);
    }
    if (sc.type) {
      validationRules.push(`"${name}" must be a ${sc.type}`);
    }
    if (sc.enum && sc.enum.length > 0) {
      validationRules.push(
        `"${name}" — allowed values: ${sc.enum.map(String).join(", ")}`
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Top two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Visual schema — 60% */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Input Schema"
            subtitle="Visual representation of accepted parameters"
          >
            {Object.keys(properties).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
                No schema available.
              </p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(properties).map(([name, s]) => {
                  const sc = s as {
                    type?: string;
                    description?: string;
                    enum?: unknown[];
                    properties?: unknown;
                  };
                  const isReq = required.includes(name);
                  return (
                    <div
                      key={name}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                      style={{ background: "var(--pc-elevated)" }}
                    >
                      {sc.type && <TypeBadge type={sc.type} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code
                            className="text-xs font-mono font-semibold"
                            style={{ color: "var(--pc-secondary)" }}
                          >
                            {name}
                          </code>
                          {isReq && (
                            <span
                              className="text-[10px] font-medium"
                              style={{ color: "#35C88A" }}
                            >
                              *
                            </span>
                          )}
                        </div>
                        {sc.description && (
                          <p
                            className="text-[11px] mt-0.5 leading-relaxed"
                            style={{ color: "var(--pc-muted)" }}
                          >
                            {sc.description}
                          </p>
                        )}
                        {sc.enum && sc.enum.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sc.enum.map((v) => (
                              <span
                                key={String(v)}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                style={{
                                  background: "rgba(72,184,232,0.1)",
                                  color: "#48B8E8",
                                }}
                              >
                                {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Raw JSON — 40% */}
        <div className="lg:col-span-2">
          <div
            className="rounded-2xl border p-6 space-y-4 h-full"
            style={{
              background: "var(--pc-surface)",
              borderColor: "var(--pc-border)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--pc-foreground)" }}
                >
                  Raw Schema
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                  JSON Schema definition
                </p>
              </div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                style={{
                  background: "var(--pc-elevated)",
                  color: "var(--pc-muted)",
                  border: "1px solid var(--pc-border)",
                }}
              >
                <Copy className="w-3 h-3" strokeWidth={2} />
                Copy
              </button>
            </div>
            <pre
              className="rounded-xl px-4 py-4 text-xs font-mono overflow-x-auto overflow-y-auto"
              style={{
                background: "var(--pc-elevated)",
                color: "var(--pc-primary)",
                border: "1px solid var(--pc-border)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: "400px",
              }}
            >
              {schema
                ? JSON.stringify(schema, null, 2)
                : "// No schema available"}
            </pre>
          </div>
        </div>
      </div>

      {/* Validation rules — full width */}
      <SectionCard
        title="Validation Rules"
        subtitle="Derived from the JSON Schema definition"
      >
        {validationRules.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            No validation rules defined.
          </p>
        ) : (
          <ul className="space-y-2">
            {validationRules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--pc-primary)" }}
                  strokeWidth={2}
                />
                <code
                  className="text-xs font-mono"
                  style={{ color: "var(--pc-foreground)" }}
                >
                  {rule}
                </code>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Access Tab ──────────────────────────────────────────────────────── */

function AccessTab({
  server,
  toolName,
  roles,
  policies,
}: {
  server: string;
  toolName: string;
  roles: RoleView[];
  policies: RateLimitPolicyView[];
}) {
  // Filter policies that match this server/tool
  const matchingPolicies = policies.filter((p) => {
    const serverMatch =
      !p.server_pattern || matchesPattern(p.server_pattern, server);
    const toolMatch =
      !p.tool_pattern || matchesPattern(p.tool_pattern, toolName);
    return serverMatch && toolMatch;
  });

  return (
    <div className="space-y-4">
      {/* Active Policies */}
      <SectionCard
        title="Active Rate Limit Policies"
        subtitle="Policies that apply to requests for this tool"
      >
        {matchingPolicies.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            No rate limit policies configured.
          </p>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--pc-border)" }}
          >
            {matchingPolicies.map((policy, i, arr) => (
              <div
                key={policy.id}
                className="flex items-center gap-4 px-4 py-3"
                style={
                  i < arr.length - 1
                    ? { borderBottom: "1px solid var(--pc-border)" }
                    : {}
                }
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--pc-foreground)" }}
                  >
                    {policy.algorithm === "token_bucket"
                      ? "Token Bucket"
                      : "Sliding Window"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                    Subject: {policy.subject_id ?? "all"}
                    {policy.server_pattern
                      ? ` · server: ${policy.server_pattern}`
                      : ""}
                    {policy.tool_pattern
                      ? ` · tool: ${policy.tool_pattern}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                  <span
                    className="px-2 py-1 rounded-lg font-medium tabular-nums"
                    style={{
                      background: "rgba(45,212,167,0.1)",
                      color: "var(--pc-primary)",
                    }}
                  >
                    {policy.request_limit} req
                  </span>
                  <span
                    className="px-2 py-1 rounded-lg font-medium tabular-nums"
                    style={{
                      background: "var(--pc-elevated)",
                      color: "var(--pc-muted)",
                    }}
                  >
                    / {policy.window_seconds}s
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {policies.length > 0 && matchingPolicies.length < policies.length && (
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            {policies.length - matchingPolicies.length} other{" "}
            {policies.length - matchingPolicies.length === 1
              ? "policy"
              : "policies"}{" "}
            configured for other servers or tools.
          </p>
        )}
      </SectionCard>

      {/* Role Permissions */}
      <SectionCard
        title="Role Permissions"
        subtitle="Roles configured in this gateway"
      >
        {roles.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            No roles defined.
          </p>
        ) : (
          <div className="space-y-3">
            <div
              className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(72,184,232,0.06)",
                border: "1px solid rgba(72,184,232,0.15)",
              }}
            >
              <Info
                className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                style={{ color: "#48B8E8" }}
                strokeWidth={1.75}
              />
              <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
                Per-role permission details are managed in the Roles section.
                The roles below exist in this gateway. To see which tools each
                role can access, visit the role&apos;s detail page.
              </p>
            </div>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--pc-border)" }}
            >
              {roles.map((role, i, arr) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={
                    i < arr.length - 1
                      ? { borderBottom: "1px solid var(--pc-border)" }
                      : {}
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--pc-elevated)" }}
                    >
                      <Users
                        className="w-3.5 h-3.5"
                        style={{ color: "var(--pc-muted)" }}
                        strokeWidth={1.75}
                      />
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--pc-foreground)" }}
                      >
                        {role.name}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        Created {relativeTime(role.created_at)}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/roles"
                    className="text-xs font-medium"
                    style={{ color: "var(--pc-primary)" }}
                  >
                    View role
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Default policy note */}
      <SectionCard
        title="Access Control Summary"
        subtitle="Default access behavior"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck
                className="w-4 h-4"
                style={{ color: "#35C88A" }}
                strokeWidth={1.75}
              />
              <p
                className="text-xs font-semibold"
                style={{ color: "#35C88A" }}
              >
                Allowed by
              </p>
            </div>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Access controlled by default policy and role permissions. Configure
              allow rules in the Roles section.
            </p>
          </div>
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldAlert
                className="w-4 h-4"
                style={{ color: "#F05D5E" }}
                strokeWidth={1.75}
              />
              <p
                className="text-xs font-semibold"
                style={{ color: "#F05D5E" }}
              >
                Denied by
              </p>
            </div>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Deny rules are configured per role. Visit the Roles section to
              restrict access to this tool.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ── Usage Tab ───────────────────────────────────────────────────────── */

type HourBucket = { hour: string; allowed: number; denied: number };

function UsageTab({
  allLogs,
  toolName,
}: {
  allLogs: AuditLogView[];
  toolName: string;
}) {
  // Filter by tool name client-side
  const logs = useMemo(
    () => allLogs.filter((l) => l.tool_name === toolName),
    [allLogs, toolName]
  );

  // Stats
  const total = logs.length;
  const allowed = logs.filter((l) => l.outcome === "allowed").length;
  const denied = logs.filter((l) => l.outcome === "denied").length;
  const successRate = total > 0 ? Math.round((allowed / total) * 100) : 0;
  const uniqueCallers = new Set(logs.map((l) => l.subject_id).filter(Boolean))
    .size;

  // Bucket by hour for last 24h
  const now = Date.now();
  const cutoff = now - 86_400_000;
  const recentLogs = logs.filter(
    (l) => new Date(l.created_at).getTime() >= cutoff
  );
  const bucketMap: Record<string, HourBucket> = {};
  for (const log of recentLogs) {
    const d = new Date(log.created_at);
    const hour = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
    if (!bucketMap[hour]) bucketMap[hour] = { hour, allowed: 0, denied: 0 };
    if (log.outcome === "allowed") bucketMap[hour].allowed++;
    else if (log.outcome === "denied") bucketMap[hour].denied++;
  }
  const chartData = Object.values(bucketMap).sort((a, b) =>
    a.hour.localeCompare(b.hour)
  );

  // Top consumers
  const callerCounts: Record<string, { count: number; lastSeen: string }> = {};
  for (const log of logs) {
    if (!log.subject_id) continue;
    if (!callerCounts[log.subject_id]) {
      callerCounts[log.subject_id] = { count: 0, lastSeen: log.created_at };
    }
    callerCounts[log.subject_id].count++;
    if (log.created_at > callerCounts[log.subject_id].lastSeen) {
      callerCounts[log.subject_id].lastSeen = log.created_at;
    }
  }
  const topCallers = Object.entries(callerCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10);

  // Error trends (denied, most recent 10)
  const deniedLogs = logs
    .filter((l) => l.outcome === "denied")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 10);

  const statCards = [
    {
      label: "Total Requests",
      value: total,
      color: "var(--pc-foreground)",
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      color: "#35C88A",
    },
    {
      label: "Avg Latency",
      value: "N/A",
      color: "var(--pc-muted)",
    },
    {
      label: "Unique Callers",
      value: uniqueCallers,
      color: "#48B8E8",
    },
  ];

  if (total === 0) {
    return (
      <div className="space-y-4">
        <div
          className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border"
          style={{
            background: "var(--pc-surface)",
            borderColor: "var(--pc-border)",
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--pc-elevated)" }}
          >
            <BarChart2
              className="w-5 h-5"
              style={{ color: "var(--pc-muted)" }}
              strokeWidth={1.5}
            />
          </div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--pc-foreground)" }}
          >
            No usage data yet
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
            Metrics appear once this tool receives traffic
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl px-4 py-3"
            style={{
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
            }}
          >
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              {label}
            </p>
            <p
              className="text-xl font-bold mt-1 tabular-nums"
              style={{ color }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <SectionCard
          title="Request Activity"
          subtitle="Allowed vs denied requests over the last 24 hours"
        >
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <defs>
                  <linearGradient
                    id="gradAllowedTool"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#35C88A"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#35C88A"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="gradDeniedTool"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#F05D5E"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#F05D5E"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(38,48,58,0.8)"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "#8B98A7", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#8B98A7", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--pc-elevated)",
                    border: "1px solid var(--pc-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--pc-foreground)",
                  }}
                  cursor={{ stroke: "rgba(139,152,167,0.2)" }}
                />
                <Area
                  type="monotone"
                  dataKey="allowed"
                  stroke="#35C88A"
                  strokeWidth={2}
                  fill="url(#gradAllowedTool)"
                  name="Allowed"
                />
                <Area
                  type="monotone"
                  dataKey="denied"
                  stroke="#F05D5E"
                  strokeWidth={2}
                  fill="url(#gradDeniedTool)"
                  name="Denied"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Top consumers */}
      {topCallers.length > 0 && (
        <SectionCard
          title="Top Consumers"
          subtitle="Subjects with the most calls to this tool"
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--pc-border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  {["Subject ID", "Calls", "Last Seen"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${
                        i > 0 ? "text-right" : "text-left"
                      }`}
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCallers.map(([subjectId, { count, lastSeen }], i, arr) => (
                  <tr
                    key={subjectId}
                    style={
                      i < arr.length - 1
                        ? { borderBottom: "1px solid var(--pc-border)" }
                        : {}
                    }
                  >
                    <td className="px-4 py-3">
                      <code
                        className="text-xs font-mono"
                        style={{ color: "var(--pc-secondary)" }}
                      >
                        {subjectId.length > 24
                          ? `${subjectId.slice(0, 12)}…${subjectId.slice(-8)}`
                          : subjectId}
                      </code>
                    </td>
                    <td
                      className="px-4 py-3 text-right text-xs tabular-nums font-semibold"
                      style={{ color: "var(--pc-foreground)" }}
                    >
                      {count}
                    </td>
                    <td
                      className="px-4 py-3 text-right text-xs"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {relativeTime(lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Error trends */}
      {deniedLogs.length > 0 && (
        <SectionCard
          title="Denied Requests"
          subtitle="Most recent denied invocations of this tool"
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--pc-border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    background: "var(--pc-elevated)",
                    borderBottom: "1px solid var(--pc-border)",
                  }}
                >
                  {["Time", "Event", "Subject", "Outcome"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${
                        i === 3 ? "text-right" : "text-left"
                      }`}
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deniedLogs.map((log, i, arr) => (
                  <tr
                    key={log.id}
                    style={
                      i < arr.length - 1
                        ? { borderBottom: "1px solid var(--pc-border)" }
                        : {}
                    }
                  >
                    <td
                      className="px-4 py-3 text-xs tabular-nums"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {relativeTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <code
                        className="text-xs font-mono"
                        style={{ color: "var(--pc-foreground)" }}
                      >
                        {log.event_type}
                      </code>
                    </td>
                    <td
                      className="px-4 py-3 text-xs max-w-[100px] truncate"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {log.subject_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(240,93,94,0.12)",
                          color: "#F05D5E",
                        }}
                      >
                        <XCircle className="w-2.5 h-2.5" strokeWidth={2.5} />
                        denied
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ── Security Tab ────────────────────────────────────────────────────── */

function SecurityTab({ tool }: { tool: McpTool | null }) {
  const toolName = tool?.name ?? "";
  const risk = getRiskLevel(toolName);
  const properties = tool?.inputSchema?.properties ?? {};

  const riskDescriptions = {
    critical:
      "This tool performs destructive operations that cannot be undone. Requires explicit approval in sensitive environments.",
    high: "This tool modifies state or sends data. Treat with elevated caution in automated pipelines.",
    medium:
      "This tool reads or queries data. Generally safe but may expose sensitive information.",
    low: "This tool performs read-only or informational operations. Low risk in most contexts.",
  };

  // Sensitive fields
  const sensitivePattern =
    /password|secret|token|key|credential|auth|api_key|private/i;
  const sensitiveFields = Object.keys(properties).filter((name) =>
    sensitivePattern.test(name)
  );

  // Data access
  const dataAccess = getDataAccess(toolName);

  // Destructive capability
  const isDestructive = risk === "critical" || risk === "high";

  return (
    <div className="space-y-4">
      {/* Risk classification */}
      <SectionCard
        title="Risk Classification"
        subtitle="Assessed risk level based on tool name heuristics"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <RiskBadge level={risk} large />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            {riskDescriptions[risk]}
          </p>
        </div>
      </SectionCard>

      {/* Sensitive Fields */}
      <SectionCard
        title="Sensitive Fields"
        subtitle="Input parameters with potentially sensitive names"
      >
        {sensitiveFields.length === 0 ? (
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "#35C88A" }}
              strokeWidth={2}
            />
            <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
              No sensitive parameter names detected.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sensitiveFields.map((field) => (
              <div key={field} className="flex items-center gap-2">
                <AlertTriangle
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: "#F4B942" }}
                  strokeWidth={2}
                />
                <code
                  className="text-xs font-mono"
                  style={{ color: "#F4B942" }}
                >
                  {field}
                </code>
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  — potentially sensitive
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Destructive Capability */}
      <SectionCard
        title="Destructive Capability"
        subtitle="Whether this tool can modify or delete data"
      >
        <div className="flex items-center gap-3">
          {isDestructive ? (
            <>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(240,93,94,0.12)",
                  color: "#F05D5E",
                }}
              >
                <XCircle className="w-3 h-3" strokeWidth={2.5} />
                Potentially destructive
              </span>
              <span className="text-sm" style={{ color: "var(--pc-muted)" }}>
                This tool may modify or delete data.
              </span>
            </>
          ) : (
            <>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(53,200,138,0.12)",
                  color: "#35C88A",
                }}
              >
                <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                Non-destructive
              </span>
              <span className="text-sm" style={{ color: "var(--pc-muted)" }}>
                This tool does not appear to perform destructive operations.
              </span>
            </>
          )}
        </div>
      </SectionCard>

      {/* Human Approval */}
      <SectionCard
        title="Human Approval Requirement"
        subtitle="Gate configuration for this tool"
      >
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
          }}
        >
          <Info
            className="w-4 h-4 mt-0.5 flex-shrink-0"
            style={{ color: "var(--pc-muted)" }}
            strokeWidth={1.75}
          />
          <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Human approval gates are not enforced at the tool level in the
            current version. Use role permissions to restrict access to
            sensitive tools.
          </p>
        </div>
      </SectionCard>

      {/* Data Access */}
      <SectionCard
        title="Data Access"
        subtitle="Types of data this tool likely accesses"
      >
        <div className="flex items-center gap-2">
          <Lock
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "var(--pc-muted)" }}
            strokeWidth={1.75}
          />
          <p className="text-sm" style={{ color: "var(--pc-foreground)" }}>
            {dataAccess}
          </p>
        </div>
        <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
          This assessment is based on the tool name. Review the server
          implementation for authoritative data access details.
        </p>
      </SectionCard>
    </div>
  );
}

/* ── Disable Dialog ──────────────────────────────────────────────────── */

function DisableTipDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4"
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(244,185,66,0.12)" }}
          >
            <Info
              className="w-4 h-4"
              style={{ color: "#F4B942" }}
              strokeWidth={1.75}
            />
          </div>
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--pc-foreground)" }}
          >
            Tool-level disable
          </h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--pc-muted)" }}>
          Tool-level disable is enforced via role permissions. To block this
          tool, deny it in a role by navigating to the Roles section and adding
          a deny rule with the pattern matching this tool&apos;s name.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ background: "var(--pc-elevated)", color: "var(--pc-foreground)" }}
          >
            Got it
          </button>
          <Link
            href="/dashboard/roles"
            className="text-xs font-medium px-4 py-2 rounded-lg"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            onClick={onClose}
          >
            Go to Roles
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function ToolDetailPage({
  params,
}: {
  params: Promise<{ server: string; tool: string }>;
}) {
  const { server, tool: rawTool } = use(params);
  const toolName = decodeURIComponent(rawTool);

  const [tab, setTab] = useState<Tab>("documentation");
  const [showDisableTip, setShowDisableTip] = useState(false);

  const token = getToken();

  // 1. Server info
  const { data: serverResp, isLoading: serverLoading } =
    useGetServerV1ServersSlugGet(server);
  const serverData = serverResp?.data as ServerView | undefined;

  // 2. Tool definition from MCP
  const {
    data: allTools,
    isLoading: toolsLoading,
  } = useQuery<McpTool[]>({
    queryKey: ["mcp-tools", server],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/mcp/${server}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "MCP error");
      return json.result?.tools ?? [];
    },
    retry: false,
  });

  const toolDef = allTools?.find((t) => t.name === toolName) ?? null;

  // 3. Audit logs (server-level, filter by tool client-side)
  const { data: auditResp } =
    useListAuditLogsV1AuditGet({ server_slug: server, limit: 200 });
  const allLogs = (auditResp?.data ?? []) as AuditLogView[];

  // Last invoked
  const toolLogs = useMemo(
    () =>
      allLogs
        .filter((l) => l.tool_name === toolName)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [allLogs, toolName]
  );
  const lastInvoked = toolLogs[0]?.created_at ?? null;

  // 4. Roles
  const { data: rolesResp } = useListRolesV1RolesGet();
  const roles = (rolesResp?.data ?? []) as RoleView[];

  // 5. Rate limit policies
  const { data: policiesResp } = useListPoliciesV1RateLimitPoliciesGet();
  const policies = (policiesResp?.data ?? []) as RateLimitPolicyView[];

  const risk = getRiskLevel(toolName);

  const isLoading = serverLoading || toolsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton
          className="h-6 w-36 rounded-lg"
          style={{ background: "var(--pc-surface)" }}
        />
        <Skeleton
          className="h-28 w-full rounded-2xl"
          style={{ background: "var(--pc-surface)" }}
        />
        <Skeleton
          className="h-10 w-full rounded-xl"
          style={{ background: "var(--pc-surface)" }}
        />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton
              key={i}
              className="h-32 w-full rounded-2xl"
              style={{ background: "var(--pc-surface)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "documentation", label: "Documentation" },
    { id: "schema", label: "Schema" },
    { id: "access", label: "Access" },
    { id: "usage", label: "Usage" },
    { id: "security", label: "Security" },
  ];

  return (
    <div className="space-y-6">
      {showDisableTip && (
        <DisableTipDialog onClose={() => setShowDisableTip(false)} />
      )}

      {/* Back link */}
      <Link
        href="/dashboard/tools"
        className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{ color: "var(--pc-muted)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to tools
      </Link>

      {/* Header */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "var(--pc-surface)",
          borderColor: "var(--pc-border)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {/* Icon */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(45,212,167,0.12)" }}
            >
              <Wrench
                className="w-5 h-5"
                style={{ color: "var(--pc-primary)" }}
                strokeWidth={1.75}
              />
            </div>
            {/* Name + meta */}
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2 mb-1">
                <h1
                  className="text-xl font-bold font-mono"
                  style={{ color: "var(--pc-foreground)" }}
                >
                  {toolName}
                </h1>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{
                    background: "var(--pc-elevated)",
                    color: "var(--pc-muted)",
                    border: "1px solid var(--pc-border)",
                  }}
                >
                  v1.0.0
                </span>
                <RiskBadge level={risk} />
                {serverData && <StatusBadge status={serverData.status} />}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--pc-muted)" }}
                >
                  <Server className="w-3 h-3" strokeWidth={1.5} />
                  <span className="font-mono">{server}</span>
                </div>
                <span style={{ color: "var(--pc-border)" }}>·</span>
                <div
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--pc-muted)" }}
                >
                  <Clock className="w-3 h-3" strokeWidth={1.5} />
                  Last invoked: {relativeTime(lastInvoked)}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/dashboard/playground?server=${encodeURIComponent(server)}&tool=${encodeURIComponent(toolName)}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(45,212,167,0.1)",
                color: "var(--pc-primary)",
                border: "1px solid rgba(45,212,167,0.2)",
              }}
            >
              <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
              Try in Playground
            </Link>
            <button
              onClick={() => setShowDisableTip(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              style={{
                background: "var(--pc-elevated)",
                color: "var(--pc-muted)",
                border: "1px solid var(--pc-border)",
              }}
            >
              <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
              Disable
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-xl overflow-x-auto"
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
        }}
      >
        {tabs.map(({ id, label }) => (
          <TabButton key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </TabButton>
        ))}
      </div>

      {/* Tab content */}
      {tab === "documentation" && <DocumentationTab tool={toolDef} />}
      {tab === "schema" && <SchemaTab tool={toolDef} />}
      {tab === "access" && (
        <AccessTab
          server={server}
          toolName={toolName}
          roles={roles}
          policies={policies}
        />
      )}
      {tab === "usage" && (
        <UsageTab allLogs={allLogs} toolName={toolName} />
      )}
      {tab === "security" && <SecurityTab tool={toolDef} />}
    </div>
  );
}
