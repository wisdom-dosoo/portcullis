"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRolesV1RolesGet,
  useCreateRoleV1RolesPost,
  useCreateBindingV1RolesRoleIdBindingsPost,
  SubjectType,
  type RoleView,
} from "@/api/generated";
import {
  Users,
  Plus,
  ShieldCheck,
  Shield,
  Code2,
  Eye,
  CreditCard,
  Crown,
  Check,
  Minus,
  Loader2,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, EMPTY_STATES } from "@/components/empty-state";

/* ── Spec-defined role archetypes ─────────────────────────────────── */

type PermCategory =
  | "Servers" | "Tools" | "Policies" | "Logs" | "Keys"
  | "Billing" | "Members" | "Settings" | "Security" | "Integrations";

type Access = "full" | "read" | "own" | "none";

interface RoleArchetype {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  permissions: Record<PermCategory, Access>;
  capabilities: string[];
}

const PERM_CATEGORIES: PermCategory[] = [
  "Servers", "Tools", "Policies", "Logs", "Keys",
  "Billing", "Members", "Settings", "Security", "Integrations",
];

const ROLE_ARCHETYPES: RoleArchetype[] = [
  {
    key: "super-admin",
    label: "Platform Super Admin",
    description: "Full platform control — organizations, infra, and system settings.",
    icon: Crown,
    iconColor: "#F4B942",
    iconBg: "rgba(244,185,66,0.15)",
    capabilities: [
      "View all organizations",
      "Suspend organizations",
      "View platform-wide usage",
      "Manage plans and limits",
      "Review security incidents",
      "Configure system settings",
      "Manage infrastructure integrations",
      "View global audit logs",
    ],
    permissions: {
      Servers: "full", Tools: "full", Policies: "full", Logs: "full", Keys: "full",
      Billing: "full", Members: "full", Settings: "full", Security: "full", Integrations: "full",
    },
  },
  {
    key: "org-owner",
    label: "Organization Owner",
    description: "Manages one organization — billing, servers, policies, and team.",
    icon: Shield,
    iconColor: "#F05D5E",
    iconBg: "rgba(240,93,94,0.15)",
    capabilities: [
      "Manage organization settings",
      "Invite and remove members",
      "Configure billing",
      "Register MCP servers",
      "Create policies",
      "Manage API keys",
      "View all organization logs",
      "Configure alerts",
    ],
    permissions: {
      Servers: "full", Tools: "full", Policies: "full", Logs: "full", Keys: "full",
      Billing: "full", Members: "full", Settings: "full", Security: "full", Integrations: "full",
    },
  },
  {
    key: "org-admin",
    label: "Organization Admin",
    description: "Technical admin — servers, tools, policies, users, and integrations.",
    icon: ShieldCheck,
    iconColor: "#2DD4A7",
    iconBg: "rgba(45,212,167,0.15)",
    capabilities: [
      "Register and manage MCP servers",
      "Manage tools",
      "Create policies",
      "Manage users and roles",
      "View usage and audit logs",
      "Configure webhooks and integrations",
    ],
    permissions: {
      Servers: "full", Tools: "full", Policies: "full", Logs: "full", Keys: "full",
      Billing: "none", Members: "full", Settings: "full", Security: "full", Integrations: "full",
    },
  },
  {
    key: "developer",
    label: "Developer",
    description: "Uses approved MCP servers and tools. Creates personal API keys.",
    icon: Code2,
    iconColor: "#48B8E8",
    iconBg: "rgba(72,184,232,0.15)",
    capabilities: [
      "View approved servers",
      "Discover approved tools",
      "Create personal API keys",
      "Test tool invocations",
      "View personal usage",
      "View permitted logs",
      "Access documentation",
    ],
    permissions: {
      Servers: "read", Tools: "read", Policies: "none", Logs: "own", Keys: "own",
      Billing: "none", Members: "none", Settings: "none", Security: "none", Integrations: "none",
    },
  },
  {
    key: "security-auditor",
    label: "Security Auditor",
    description: "Read-only security visibility — policies, audit logs, auth events.",
    icon: Eye,
    iconColor: "#8B98A7",
    iconBg: "rgba(139,152,167,0.15)",
    capabilities: [
      "View policies",
      "View audit logs",
      "View authentication events",
      "View blocked requests",
      "Export compliance reports",
      "Cannot change configuration",
    ],
    permissions: {
      Servers: "read", Tools: "read", Policies: "read", Logs: "full", Keys: "none",
      Billing: "none", Members: "none", Settings: "none", Security: "read", Integrations: "none",
    },
  },
  {
    key: "billing-manager",
    label: "Billing Manager",
    description: "Manages subscriptions, invoices, and payment details.",
    icon: CreditCard,
    iconColor: "#35C88A",
    iconBg: "rgba(53,200,138,0.15)",
    capabilities: [
      "View billing",
      "Download invoices",
      "View usage",
      "Upgrade or downgrade plans",
      "Manage payment details",
    ],
    permissions: {
      Servers: "none", Tools: "none", Policies: "none", Logs: "none", Keys: "none",
      Billing: "full", Members: "none", Settings: "none", Security: "none", Integrations: "none",
    },
  },
];

/* ── helpers ─────────────────────────────────────────────────────── */

function AccessBadge({ access }: { access: Access }) {
  if (access === "full") return (
    <div className="flex justify-center">
      <Check className="w-3.5 h-3.5" style={{ color: "#2DD4A7" }} strokeWidth={2.5} />
    </div>
  );
  if (access === "read") return (
    <div className="flex justify-center">
      <Eye className="w-3 h-3" style={{ color: "#48B8E8" }} strokeWidth={2} />
    </div>
  );
  if (access === "own") return (
    <div className="flex justify-center">
      <span className="text-[10px] font-semibold" style={{ color: "#F4B942" }}>own</span>
    </div>
  );
  return (
    <div className="flex justify-center">
      <Minus className="w-3 h-3" style={{ color: "var(--pc-border)" }} strokeWidth={2} />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
      style={active
        ? { background: "rgba(45,212,167,0.12)", color: "var(--pc-primary)" }
        : { color: "var(--pc-muted)" }}
    >
      {children}
    </button>
  );
}

/* ── Seed roles dialog ───────────────────────────────────────────── */

function SeedRolesButton({ existingNames, onSeeded }: { existingNames: Set<string>; onSeeded: () => void }) {
  const createRole = useCreateRoleV1RolesPost();
  const [seeding, setSeeding] = useState(false);

  const missing = ROLE_ARCHETYPES.filter(
    (r) => !existingNames.has(r.label) && !existingNames.has(r.key)
  );

  if (missing.length === 0) return null;

  async function handleSeed() {
    setSeeding(true);
    let created = 0;
    for (const archetype of missing) {
      try {
        await createRole.mutateAsync({ data: { name: archetype.label } });
        created++;
      } catch {
        // skip duplicates
      }
    }
    setSeeding(false);
    onSeeded();
    toast.success(`Created ${created} standard role${created !== 1 ? "s" : ""}`);
  }

  return (
    <button
      onClick={handleSeed}
      disabled={seeding}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50"
      style={{ borderColor: "rgba(45,212,167,0.4)", color: "var(--pc-primary)", background: "rgba(45,212,167,0.06)" }}
    >
      {seeding
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />}
      Seed {missing.length} standard role{missing.length !== 1 ? "s" : ""}
    </button>
  );
}

/* ── Roles panel ─────────────────────────────────────────────────── */

function RolesPanel({
  roles,
  isLoading,
  onCreateOpen,
  onRefresh,
}: {
  roles: RoleView[];
  isLoading: boolean;
  onCreateOpen: () => void;
  onRefresh: () => void;
}) {
  const existingNames = new Set(roles.map((r) => r.name));

  return (
    <div className="space-y-6">
      {/* Seeding banner */}
      <div
        className="rounded-2xl border p-5 flex items-start gap-4"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--pc-foreground)" }}>
            Standard role archetypes
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Portcullis defines 6 built-in role types. Seed them into your gateway to start assigning access, or create custom roles below.
          </p>
        </div>
        <div className="flex-shrink-0">
          <SeedRolesButton existingNames={existingNames} onSeeded={onRefresh} />
        </div>
      </div>

      {/* Archetype reference cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLE_ARCHETYPES.map((archetype) => {
          const Icon = archetype.icon;
          const inGateway = existingNames.has(archetype.label) || existingNames.has(archetype.key);
          return (
            <div
              key={archetype.key}
              className="rounded-2xl border p-5 flex flex-col gap-3"
              style={{ background: "var(--pc-surface)", borderColor: inGateway ? "rgba(45,212,167,0.3)" : "var(--pc-border)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: archetype.iconBg }}
                >
                  <Icon className="w-4.5 h-4.5" strokeWidth={1.75} style={{ color: archetype.iconColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
                      {archetype.label}
                    </p>
                    {inGateway && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(45,212,167,0.12)", color: "#2DD4A7" }}
                      >
                        active
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                    {archetype.description}
                  </p>
                </div>
              </div>
              <ul className="space-y-1 pl-1">
                {archetype.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2">
                    <Check className="w-3 h-3 flex-shrink-0 mt-0.5" strokeWidth={2.5} style={{ color: archetype.iconColor }} />
                    <span className="text-xs" style={{ color: "var(--pc-muted)" }}>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Custom roles from API */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Gateway Roles
          </h3>
          <button
            onClick={onCreateOpen}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Create Role
          </button>
        </div>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />)}
            </div>
          ) : roles.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={EMPTY_STATES.roles.title}
              description={EMPTY_STATES.roles.description}
              features={[...EMPTY_STATES.roles.features]}
              actions={[
                { label: EMPTY_STATES.roles.primaryAction.label, href: EMPTY_STATES.roles.primaryAction.href },
                { label: EMPTY_STATES.roles.docsAction.label,    href: EMPTY_STATES.roles.docsAction.href, variant: "secondary" },
              ]}
              compact
            />
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>ID</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const archetype = ROLE_ARCHETYPES.find(
                    (a) => a.label === r.name || a.key === r.name
                  );
                  const Icon = archetype?.icon ?? ShieldCheck;
                  const iconColor = archetype?.iconColor ?? "var(--pc-muted)";
                  const iconBg = archetype?.iconBg ?? "rgba(139,152,167,0.1)";
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: iconBg }}
                          >
                            <Icon className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: iconColor }} />
                          </div>
                          <span className="font-medium text-sm" style={{ color: "var(--pc-foreground)" }}>{r.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <code className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}>
                          {r.id}
                        </code>
                      </td>
                      <td className="px-5 py-3.5 text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Role bindings panel ─────────────────────────────────────────── */

function BindingsPanel({ roles, isLoading }: { roles: RoleView[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const createBinding = useCreateBindingV1RolesRoleIdBindingsPost();
  const [form, setForm] = useState({
    subject_id: "",
    subject_type: SubjectType.api_key,
    role_id: "",
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.role_id) { toast.error("Select a role"); return; }
    try {
      await createBinding.mutateAsync({
        roleId: form.role_id,
        data: { subject_id: form.subject_id, subject_type: form.subject_type },
      });
      toast.success("Member added to role");
      setForm((f) => ({ ...f, subject_id: "" }));
      qc.invalidateQueries({ queryKey: ["/v1/roles"] });
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to add member"
      );
    }
  }

  const inputStyle = {
    background: "var(--pc-elevated)",
    borderColor: "var(--pc-border)",
    color: "var(--pc-foreground)",
  };

  return (
    <div className="space-y-6">
      {/* Info card */}
      <div
        className="rounded-2xl border px-5 py-4 flex items-start gap-3"
        style={{ background: "rgba(72,184,232,0.06)", borderColor: "rgba(72,184,232,0.25)" }}
      >
        <Users className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#48B8E8" }} strokeWidth={1.75} />
        <div>
          <p className="text-sm font-medium" style={{ color: "#48B8E8" }}>Role Bindings</p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Assign a subject (API key ID or OAuth subject) to a role. The subject will gain all tool permissions defined for that role.
          </p>
        </div>
      </div>

      {/* Add member form */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
          Add Member to Role
        </h3>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
                Subject ID
              </label>
              <input
                required
                placeholder="API key ID or OAuth subject"
                value={form.subject_id}
                onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-mono"
                style={inputStyle}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
                Subject Type
              </label>
              <select
                value={form.subject_type}
                onChange={(e) => setForm((f) => ({ ...f, subject_type: e.target.value as typeof form.subject_type }))}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                style={inputStyle}
              >
                <option value={SubjectType.api_key}>API Key</option>
                <option value={SubjectType.oauth_subject}>OAuth Subject</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
              Role
            </label>
            {isLoading ? (
              <Skeleton className="h-10 w-full rounded-xl" style={{ background: "var(--pc-elevated)" }} />
            ) : (
              <select
                required
                value={form.role_id}
                onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                style={inputStyle}
              >
                <option value="">Select a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createBinding.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {createBinding.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <UserPlus className="w-4 h-4" strokeWidth={2} />}
              Add Member
            </button>
          </div>
        </form>
      </div>

      {/* Note about listing */}
      <p className="text-xs text-center" style={{ color: "var(--pc-muted)" }}>
        Existing role bindings are managed through the Policies page. Use the API key prefix shown in API Keys to look up subject IDs.
      </p>
    </div>
  );
}

/* ── Permission matrix panel ─────────────────────────────────────── */

function MatrixPanel() {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
            <tr>
              <th
                className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider min-w-[180px]"
                style={{ color: "var(--pc-muted)" }}
              >
                Role
              </th>
              {PERM_CATEGORIES.map((cat) => (
                <th
                  key={cat}
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center min-w-[80px]"
                  style={{ color: "var(--pc-muted)" }}
                >
                  {cat}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_ARCHETYPES.map((archetype) => {
              const Icon = archetype.icon;
              return (
                <tr
                  key={archetype.key}
                  style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: archetype.iconBg }}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: archetype.iconColor }} />
                      </div>
                      <span className="font-medium text-xs" style={{ color: "var(--pc-foreground)" }}>
                        {archetype.label}
                      </span>
                    </div>
                  </td>
                  {PERM_CATEGORIES.map((cat) => (
                    <td key={cat} className="px-3 py-3.5 text-center">
                      <AccessBadge access={archetype.permissions[cat]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-5 px-5 py-3 border-t"
        style={{ borderColor: "var(--pc-border)", background: "var(--pc-elevated)" }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--pc-muted)" }}>
          Legend
        </span>
        {[
          { icon: <Check className="w-3 h-3" strokeWidth={2.5} style={{ color: "#2DD4A7" }} />, label: "Full access" },
          { icon: <Eye className="w-3 h-3" strokeWidth={2} style={{ color: "#48B8E8" }} />, label: "Read only" },
          { icon: <span className="text-[10px] font-bold" style={{ color: "#F4B942" }}>own</span>, label: "Own resources" },
          { icon: <Minus className="w-3 h-3" strokeWidth={2} style={{ color: "var(--pc-border)" }} />, label: "No access" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            {icon}
            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

type SubTab = "roles" | "bindings" | "matrix";

export default function RolesTab() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<SubTab>("roles");
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const { data: resp, isLoading } = useListRolesV1RolesGet();
  const roles = (resp?.data ?? []) as RoleView[];
  const createRole = useCreateRoleV1RolesPost();

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRole.mutateAsync({ data: { name: newRoleName } });
      toast.success(`Role "${newRoleName}" created`);
      setCreateOpen(false);
      setNewRoleName("");
      qc.invalidateQueries({ queryKey: ["/v1/roles"] });
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to create role"
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1">
        <TabButton active={tab === "roles"}    onClick={() => setTab("roles")}>
          <span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />Roles</span>
        </TabButton>
        <TabButton active={tab === "bindings"} onClick={() => setTab("bindings")}>
          <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" strokeWidth={1.75} />Role Bindings</span>
        </TabButton>
        <TabButton active={tab === "matrix"}   onClick={() => setTab("matrix")}>
          <span className="flex items-center gap-2"><Check className="w-3.5 h-3.5" strokeWidth={1.75} />Permission Matrix</span>
        </TabButton>
      </div>

      {/* Tab content */}
      {tab === "roles" && (
        <RolesPanel
          roles={roles}
          isLoading={isLoading}
          onCreateOpen={() => setCreateOpen(true)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["/v1/roles"] })}
        />
      )}
      {tab === "bindings" && <BindingsPanel roles={roles} isLoading={isLoading} />}
      {tab === "matrix"  && <MatrixPanel />}

      {/* Create role dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base" style={{ color: "var(--pc-foreground)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(45,212,167,0.15)" }}>
                <ShieldCheck className="w-4 h-4" style={{ color: "#2DD4A7" }} strokeWidth={1.75} />
              </div>
              Create Custom Role
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRole} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
                Role Name
              </label>
              <input
                required
                placeholder="e.g. read-only, ci-deploy"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: "var(--pc-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createRole.isPending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                {createRole.isPending ? "Creating…" : "Create"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
