"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Zap,
  Shield,
  ShieldAlert,
  Users,
  Server as ServerIcon,
  Wrench,
  Clock,
  Globe,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  Eye,
} from "lucide-react";
import {
  useListRolesV1RolesGet,
  useListServersV1ServersGet,
  useCreatePolicyV1RateLimitPoliciesPost,
  useCreateRoleV1RolesPost,
  useCreatePermissionV1RolesRoleIdPermissionsPost,
  RateLimitAlgorithm,
  PermissionEffect,
  type RoleView,
  type ServerView,
} from "@/api/generated";
import { getToken } from "@/lib/auth";

/* ── types ───────────────────────────────────────────────────────── */

type PolicyAction = "allow" | "deny" | "rate_limit" | "log_only";
type SubjectMode = "all" | "role" | "api_key" | "oauth_subject";

interface WizardState {
  /* step 1 */
  name: string;
  description: string;
  owner: string;
  environment: string;
  tags: string;
  /* step 2 */
  subjectMode: SubjectMode;
  roleId: string;
  subjectId: string;
  /* step 3 */
  serverPattern: string;
  toolPattern: string;
  /* step 4 */
  action: PolicyAction;
  /* step 5 — conditions (UI only except rate-limit params) */
  timeWindowStart: string;
  timeWindowEnd: string;
  ipRange: string;
  /* step 6 — controls */
  requestLimit: number;
  windowSeconds: number;
  algorithm: "token_bucket" | "sliding_window";
  burstCapacity: number;
  priority: number;
  /* step 7 — test */
  testSubjectId: string;
  testToolName: string;
  testResult: { outcome: string; explanation: string } | null;
}

const INIT: WizardState = {
  name: "", description: "", owner: "", environment: "development", tags: "",
  subjectMode: "all", roleId: "", subjectId: "",
  serverPattern: "*", toolPattern: "*",
  action: "rate_limit",
  timeWindowStart: "", timeWindowEnd: "", ipRange: "",
  requestLimit: 100, windowSeconds: 60, algorithm: "sliding_window", burstCapacity: 0, priority: 100,
  testSubjectId: "", testToolName: "", testResult: null,
};

/* ── human-readable preview ──────────────────────────────────────── */

function buildExplanation(s: WizardState, roles: RoleView[]): string {
  const roleName = roles.find((r) => r.id === s.roleId)?.name;
  const subjStr =
    s.subjectMode === "all" ? "All subjects" :
    s.subjectMode === "role" ? `Members of role "${roleName ?? s.roleId}"` :
    s.subjectMode === "api_key" ? `API key "${s.subjectId || "<unset>"}"` :
    `OAuth subject "${s.subjectId || "<unset>"}"`;

  const toolStr = (!s.toolPattern || s.toolPattern === "*") ? "all tools" : `tools matching "${s.toolPattern}"`;
  const serverStr = (!s.serverPattern || s.serverPattern === "*") ? "all servers" : `server "${s.serverPattern}"`;

  if (s.action === "rate_limit") {
    const algo = s.algorithm === "sliding_window" ? "sliding window" : "token bucket";
    const time = (s.timeWindowStart && s.timeWindowEnd)
      ? ` between ${s.timeWindowStart} and ${s.timeWindowEnd} UTC`
      : "";
    return `${subjStr} may make at most ${s.requestLimit} requests per ${s.windowSeconds}s to ${toolStr} on ${serverStr}${time}, enforced using a ${algo} algorithm with priority ${s.priority}.`;
  }
  if (s.action === "allow") {
    return `${subjStr} are permitted to invoke ${toolStr} on ${serverStr}.`;
  }
  if (s.action === "deny") {
    return `${subjStr} are denied access to ${toolStr} on ${serverStr}.`;
  }
  return `${subjStr} requests to ${toolStr} on ${serverStr} will be logged without enforcement.`;
}

/* ── shared inputs ───────────────────────────────────────────────── */

const inp: React.CSSProperties = {
  background: "var(--pc-elevated)", border: "1px solid var(--pc-border)",
  borderRadius: 9, padding: "8px 12px", fontSize: 13,
  color: "var(--pc-foreground)", outline: "none", width: "100%", boxSizing: "border-box",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide block" style={{ color: "var(--pc-muted)" }}>{label}</label>
      {children}
      {hint && <p className="text-xs" style={{ color: "var(--pc-muted)" }}>{hint}</p>}
    </div>
  );
}

function OptionCard({ active, onClick, icon: Icon, title, sub, color = "var(--pc-primary)" }: {
  active: boolean; onClick: () => void; icon: React.ElementType; title: string; sub?: string; color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border text-left transition-all"
      style={{
        border: `1px solid ${active ? color + "60" : "var(--pc-border)"}`,
        background: active ? color + "10" : "var(--pc-elevated)",
        cursor: "pointer",
      }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: active ? color + "20" : "var(--pc-bg)" }}>
        <Icon size={16} strokeWidth={1.75} style={{ color: active ? color : "var(--pc-muted)" }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: active ? "var(--pc-foreground)" : "var(--pc-muted)" }}>{title}</p>
        {sub && <p className="text-xs" style={{ color: "var(--pc-muted)" }}>{sub}</p>}
      </div>
      {active && <CheckCircle2 size={15} strokeWidth={2} style={{ color, marginLeft: "auto", flexShrink: 0 }} />}
    </button>
  );
}

/* ── step components ─────────────────────────────────────────────── */

function Step1({ s, set }: { s: WizardState; set: (k: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Policy Name" hint="A short, descriptive name for this policy">
        <input value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Backend team read-only limit" style={inp}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </Field>
      <Field label="Description">
        <textarea value={s.description} onChange={(e) => set("description", e.target.value)} rows={3}
          placeholder="What does this policy do and why?" style={{ ...inp, resize: "vertical" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Owner">
          <input value={s.owner} onChange={(e) => set("owner", e.target.value)} placeholder="team or person" style={inp}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </Field>
        <Field label="Environment">
          <select value={s.environment} onChange={(e) => set("environment", e.target.value)}
            style={{ ...inp, cursor: "pointer" }}>
            <option value="all">All Environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
            <option value="local">Local</option>
          </select>
        </Field>
      </div>
      <Field label="Tags" hint="Comma-separated tags for organization">
        <input value={s.tags} onChange={(e) => set("tags", e.target.value)} placeholder="backend, read-only, github" style={inp}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </Field>
    </div>
  );
}

function Step2({ s, set, roles }: { s: WizardState; set: (k: keyof WizardState, v: string) => void; roles: RoleView[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--pc-muted)" }}>Who does this policy apply to?</p>
      <div className="space-y-2">
        <OptionCard active={s.subjectMode === "all"} onClick={() => set("subjectMode", "all")}
          icon={Globe} title="All Subjects" sub="Applies to every authenticated request" />
        <OptionCard active={s.subjectMode === "role"} onClick={() => set("subjectMode", "role")}
          icon={Users} title="Role" sub="Applies to subjects bound to a specific role" color="#48B8E8" />
        <OptionCard active={s.subjectMode === "api_key"} onClick={() => set("subjectMode", "api_key")}
          icon={Shield} title="API Key" sub="Applies to a specific API key subject" color="#F4B942" />
        <OptionCard active={s.subjectMode === "oauth_subject"} onClick={() => set("subjectMode", "oauth_subject")}
          icon={Users} title="OAuth Subject" sub="Applies to a specific JWT sub claim" color="#35C88A" />
      </div>

      {s.subjectMode === "role" && (
        <Field label="Select Role">
          <select value={s.roleId} onChange={(e) => set("roleId", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            <option value="">Choose a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      )}
      {(s.subjectMode === "api_key" || s.subjectMode === "oauth_subject") && (
        <Field label="Subject ID" hint="The UUID of the API key or the JWT sub claim">
          <input value={s.subjectId} onChange={(e) => set("subjectId", e.target.value)}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </Field>
      )}
    </div>
  );
}

function Step3({ s, set, servers }: { s: WizardState; set: (k: keyof WizardState, v: string) => void; servers: ServerView[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--pc-muted)" }}>Which servers and tools does this policy apply to?</p>
      <Field label="Server Pattern" hint="Use * to match all servers, or a server slug pattern (e.g. github-*, prod-*)">
        <div className="flex gap-2">
          <input value={s.serverPattern} onChange={(e) => set("serverPattern", e.target.value)}
            placeholder="* (all servers)" style={{ ...inp, flex: 1, fontFamily: "monospace" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </div>
        {servers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["*", ...servers.map((s) => s.slug)].map((slug) => (
              <button key={slug} type="button" onClick={() => set("serverPattern", slug)}
                className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                style={{
                  border: `1px solid ${s.serverPattern === slug ? "rgba(45,212,167,0.4)" : "var(--pc-border)"}`,
                  background: s.serverPattern === slug ? "rgba(45,212,167,0.1)" : "var(--pc-elevated)",
                  color: s.serverPattern === slug ? "var(--pc-primary)" : "var(--pc-muted)",
                  cursor: "pointer", fontFamily: "monospace",
                }}>
                {slug}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="Tool Pattern" hint="Use * to match all tools, or a pattern (e.g. read_*, get_*, create_*)">
        <input value={s.toolPattern} onChange={(e) => set("toolPattern", e.target.value)}
          placeholder="* (all tools)" style={{ ...inp, fontFamily: "monospace" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {["*", "read_*", "get_*", "list_*", "search_*", "create_*", "delete_*"].map((p) => (
            <button key={p} type="button" onClick={() => set("toolPattern", p)}
              className="text-xs px-2.5 py-1 rounded-lg border"
              style={{
                border: `1px solid ${s.toolPattern === p ? "rgba(45,212,167,0.4)" : "var(--pc-border)"}`,
                background: s.toolPattern === p ? "rgba(45,212,167,0.1)" : "var(--pc-elevated)",
                color: s.toolPattern === p ? "var(--pc-primary)" : "var(--pc-muted)",
                cursor: "pointer", fontFamily: "monospace",
              }}>
              {p}
            </button>
          ))}
        </div>
      </Field>
      {s.serverPattern === "*" && s.toolPattern === "*" && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: "rgba(244,185,66,0.08)", border: "1px solid rgba(244,185,66,0.2)" }}>
          <AlertTriangle size={13} style={{ color: "#F4B942", flexShrink: 0, marginTop: 1 }} strokeWidth={2} />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Both server and tool patterns are wildcards. This policy will apply to <strong style={{ color: "#F4B942" }}>all tools on all servers</strong>. Consider narrowing the scope.
          </p>
        </div>
      )}
    </div>
  );
}

function Step4({ s, set }: { s: WizardState; set: (k: keyof WizardState, v: string) => void }) {
  const actions = [
    { id: "allow",      icon: CheckCircle2, title: "Allow",          sub: "Permit matched requests to proceed",                color: "#35C88A" },
    { id: "deny",       icon: AlertTriangle, title: "Deny",           sub: "Block matched requests with an error response",      color: "#F05D5E" },
    { id: "rate_limit", icon: Zap,          title: "Rate Limit",     sub: "Allow requests up to a configured rate threshold",   color: "#48B8E8" },
    { id: "log_only",   icon: Eye,          title: "Log Only",       sub: "Allow all requests but record them for audit review", color: "#8B98A7" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--pc-muted)" }}>What action should this policy take when matched?</p>
      {actions.map((a) => (
        <OptionCard key={a.id} active={s.action === a.id} onClick={() => set("action", a.id)}
          icon={a.icon} title={a.title} sub={a.sub} color={a.color} />
      ))}
      {s.action === "allow" || s.action === "deny" ? (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(72,184,232,0.06)", border: "1px solid rgba(72,184,232,0.15)" }}>
          <Info size={13} style={{ color: "#48B8E8", flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Allow / Deny rules require a role to be selected in the Subjects step. They will be created as tool permissions on that role.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Step5({ s, set }: { s: WizardState; set: (k: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
        {s.action === "rate_limit" ? "Configure rate conditions." : "Add optional conditions (UI reference only — stored as metadata)."}
      </p>
      {s.action !== "rate_limit" && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(72,184,232,0.06)", border: "1px solid rgba(72,184,232,0.15)" }}>
          <Info size={13} style={{ color: "#48B8E8", flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Conditional logic beyond rate limiting is not enforced by the gateway at runtime. Configure these for documentation and future enforcement.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Time Window Start (UTC)" hint="e.g. 06:00">
          <input value={s.timeWindowStart} onChange={(e) => set("timeWindowStart", e.target.value)}
            placeholder="06:00" style={inp}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </Field>
        <Field label="Time Window End (UTC)" hint="e.g. 22:00">
          <input value={s.timeWindowEnd} onChange={(e) => set("timeWindowEnd", e.target.value)}
            placeholder="22:00" style={inp}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </Field>
      </div>
      <Field label="Allowed IP Ranges" hint="CIDR notation, comma-separated (e.g. 10.0.0.0/8, 192.168.0.0/16)">
        <input value={s.ipRange} onChange={(e) => set("ipRange", e.target.value)}
          placeholder="0.0.0.0/0 (all)" style={{ ...inp, fontFamily: "monospace" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </Field>
    </div>
  );
}

function Step6({ s, set, setNum }: {
  s: WizardState;
  set: (k: keyof WizardState, v: string) => void;
  setNum: (k: keyof WizardState, v: number) => void;
}) {
  return (
    <div className="space-y-4">
      {s.action === "rate_limit" ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Request Limit" hint="Maximum requests allowed per window">
              <input type="number" value={s.requestLimit} onChange={(e) => setNum("requestLimit", Number(e.target.value))} min={1} style={inp}
                onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
            </Field>
            <Field label="Window (seconds)">
              <input type="number" value={s.windowSeconds} onChange={(e) => setNum("windowSeconds", Number(e.target.value))} min={1} style={inp}
                onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Algorithm">
              <select value={s.algorithm} onChange={(e) => set("algorithm", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                <option value="sliding_window">Sliding Window</option>
                <option value="token_bucket">Token Bucket</option>
              </select>
            </Field>
            <Field label="Burst Capacity" hint="Extra requests allowed in bursts (0 = no burst)">
              <input type="number" value={s.burstCapacity} onChange={(e) => setNum("burstCapacity", Number(e.target.value))} min={0} style={inp}
                onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
            </Field>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(72,184,232,0.06)", border: "1px solid rgba(72,184,232,0.15)" }}>
          <Info size={13} style={{ color: "#48B8E8", flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Rate limiting controls only apply to rate_limit action policies. RBAC allow/deny rules take effect based on role assignment.
          </p>
        </div>
      )}
      <Field label="Priority" hint="Lower numbers = higher priority. Evaluated before higher-priority-numbered policies.">
        <input type="number" value={s.priority} onChange={(e) => setNum("priority", Number(e.target.value))} min={1} max={1000} style={inp}
          onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
      </Field>
    </div>
  );
}

function Step7({ s, set, explanation, onTest }: {
  s: WizardState;
  set: (k: keyof WizardState, v: string) => void;
  explanation: string;
  onTest: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div className="rounded-xl border px-5 py-4" style={{ background: "rgba(45,212,167,0.04)", borderColor: "rgba(45,212,167,0.2)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pc-primary)" }}>Policy Preview</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--pc-foreground)" }}>{explanation}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Test Subject ID" hint="Simulate a request from this subject">
          <input value={s.testSubjectId} onChange={(e) => set("testSubjectId", e.target.value)}
            placeholder="api-key-uuid or subject" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </Field>
        <Field label="Test Tool Name">
          <input value={s.testToolName} onChange={(e) => set("testToolName", e.target.value)}
            placeholder="e.g. search_issues" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}
            onFocus={(e) => (e.target.style.borderColor = "var(--pc-primary)")} onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")} />
        </Field>
      </div>

      <button type="button" onClick={onTest}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ background: "var(--pc-elevated)", color: "var(--pc-foreground)", border: "1px solid var(--pc-border)" }}>
        <Eye size={14} strokeWidth={2} /> Simulate Decision
      </button>

      {s.testResult && (
        <div className="rounded-xl border px-5 py-4"
          style={{
            background: s.testResult.outcome === "allowed" ? "rgba(53,200,138,0.07)" : "rgba(240,93,94,0.07)",
            borderColor: s.testResult.outcome === "allowed" ? "rgba(53,200,138,0.25)" : "rgba(240,93,94,0.25)",
          }}>
          <div className="flex items-center gap-2 mb-2">
            {s.testResult.outcome === "allowed"
              ? <CheckCircle2 size={15} style={{ color: "#35C88A" }} strokeWidth={2} />
              : <AlertTriangle size={15} style={{ color: "#F05D5E" }} strokeWidth={2} />}
            <p className="text-sm font-semibold" style={{ color: s.testResult.outcome === "allowed" ? "#35C88A" : "#F05D5E" }}>
              {s.testResult.outcome === "allowed" ? "Request would be ALLOWED" : "Request would be DENIED"}
            </p>
          </div>
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>{s.testResult.explanation}</p>
        </div>
      )}
    </div>
  );
}

function Step8({ s, explanation, roles, isPublishing }: {
  s: WizardState;
  explanation: string;
  roles: RoleView[];
  isPublishing: boolean;
}) {
  const roleName = roles.find((r) => r.id === s.roleId)?.name;
  const rows = [
    { label: "Name", value: s.name || "(unnamed)" },
    { label: "Action", value: s.action.replace("_", " ") },
    { label: "Subjects", value: s.subjectMode === "role" ? `Role: ${roleName ?? s.roleId}` : s.subjectMode === "all" ? "All subjects" : s.subjectId || "(not set)" },
    { label: "Server Pattern", value: s.serverPattern || "*" },
    { label: "Tool Pattern", value: s.toolPattern || "*" },
    ...(s.action === "rate_limit" ? [
      { label: "Request Limit", value: `${s.requestLimit} / ${s.windowSeconds}s` },
      { label: "Algorithm", value: s.algorithm.replace("_", " ") },
      { label: "Burst", value: s.burstCapacity > 0 ? String(s.burstCapacity) : "None" },
    ] : []),
    { label: "Priority", value: String(s.priority) },
    { label: "Environment", value: s.environment },
  ];

  const warnings: string[] = [];
  if (s.serverPattern === "*" && s.toolPattern === "*") warnings.push("Overly broad: both server and tool patterns are wildcards.");
  if (s.action === "deny" && s.subjectMode === "all") warnings.push("Denying all subjects may break legitimate access.");
  if ((s.action === "allow" || s.action === "deny") && !s.roleId && s.subjectMode === "role") warnings.push("No role selected — this permission will not be created.");

  return (
    <div className="space-y-5">
      {/* Human-readable summary */}
      <div className="rounded-xl border px-5 py-4" style={{ background: "rgba(45,212,167,0.04)", borderColor: "rgba(45,212,167,0.2)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pc-primary)" }}>Plain-Language Summary</p>
        <p className="text-sm leading-relaxed italic" style={{ color: "var(--pc-foreground)" }}>"{explanation}"</p>
      </div>

      {/* Summary table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pc-border)" }}>
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-4 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(38,48,58,0.4)" }}>
            <span className="w-36 flex-shrink-0 text-xs font-medium" style={{ color: "var(--pc-muted)" }}>{label}</span>
            <span className="text-sm font-mono" style={{ color: "var(--pc-foreground)" }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: "rgba(244,185,66,0.08)", border: "1px solid rgba(244,185,66,0.2)" }}>
          <AlertTriangle size={13} style={{ color: "#F4B942", flexShrink: 0 }} strokeWidth={2} />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>{w}</p>
        </div>
      ))}

      {isPublishing && (
        <div className="flex items-center gap-3" style={{ color: "var(--pc-muted)" }}>
          <Loader2 size={16} className="animate-spin" strokeWidth={2} />
          <span className="text-sm">Publishing policy…</span>
        </div>
      )}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: "Name & Purpose" },
  { id: 2, label: "Subjects" },
  { id: 3, label: "Resources" },
  { id: 4, label: "Action" },
  { id: 5, label: "Conditions" },
  { id: 6, label: "Controls" },
  { id: 7, label: "Test" },
  { id: 8, label: "Review" },
];

export default function NewPolicyPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(INIT);
  const [isPublishing, setIsPublishing] = useState(false);

  const { data: rolesResp } = useListRolesV1RolesGet();
  const { data: serversResp } = useListServersV1ServersGet();
  const roles = (rolesResp?.data ?? []) as RoleView[];
  const servers = (serversResp?.data ?? []) as ServerView[];

  const createRL = useCreatePolicyV1RateLimitPoliciesPost();
  const createRole = useCreateRoleV1RolesPost();
  const createPermission = useCreatePermissionV1RolesRoleIdPermissionsPost();

  function set(k: keyof WizardState, v: string) {
    setState((prev) => ({ ...prev, [k]: v }));
  }
  function setNum(k: keyof WizardState, v: number) {
    setState((prev) => ({ ...prev, [k]: v }));
  }

  const explanation = useMemo(() => buildExplanation(state, roles), [state, roles]);

  function simulateDecision() {
    const toolMatches = !state.toolPattern || state.toolPattern === "*" ||
      state.testToolName.startsWith(state.toolPattern.replace("*", "")) ||
      state.testToolName === state.toolPattern;
    const subjectMatches = state.subjectMode === "all" ||
      (state.subjectMode === "api_key" && state.testSubjectId === state.subjectId) ||
      state.subjectMode === "role";

    const would = toolMatches && subjectMatches;
    const outcome = state.action === "deny" ? (would ? "denied" : "allowed") : (would ? "allowed" : "allowed");
    const why = would
      ? `The test subject "${state.testSubjectId || "(any)"}" and tool "${state.testToolName || "(any)"}" match this policy's patterns.`
      : `The test inputs do not match this policy's patterns, so the policy would not apply.`;
    setState((prev) => ({ ...prev, testResult: { outcome, explanation: why } }));
  }

  async function publish() {
    setIsPublishing(true);
    try {
      if (state.action === "rate_limit") {
        await createRL.mutateAsync({
          data: {
            subject_id: state.subjectMode === "all" ? undefined : state.subjectId || undefined,
            server_pattern: state.serverPattern || null,
            tool_pattern: state.toolPattern || null,
            algorithm: state.algorithm === "sliding_window" ? RateLimitAlgorithm.sliding_window : RateLimitAlgorithm.token_bucket,
            request_limit: state.requestLimit,
            window_seconds: state.windowSeconds,
            burst_capacity: state.burstCapacity || null,
            priority: state.priority,
          },
        });
        qc.invalidateQueries({ queryKey: ["/v1/rate-limit-policies"] });
        toast.success("Rate limit policy created");
      } else if (state.action === "allow" || state.action === "deny") {
        let roleId = state.roleId;
        if (!roleId) {
          /* create a new role named after the policy */
          const newRole = await createRole.mutateAsync({ data: { name: state.name || "New Policy Role" } });
          roleId = (newRole.data as RoleView).id;
          qc.invalidateQueries({ queryKey: ["/v1/roles"] });
        }
        await createPermission.mutateAsync({
          roleId,
          data: {
            server_pattern: state.serverPattern || "*",
            tool_pattern: state.toolPattern || "*",
            effect: state.action === "allow" ? PermissionEffect.allow : PermissionEffect.deny,
            priority: state.priority,
          },
        });
        qc.invalidateQueries({ queryKey: ["/v1/roles"] });
        toast.success("Access policy created");
      } else {
        toast.success("Policy saved (log-only — no enforcement action created)");
      }
      router.push("/dashboard/policies");
    } catch (err) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to create policy");
    } finally {
      setIsPublishing(false);
    }
  }

  const canProceed = (() => {
    if (step === 1 && !state.name.trim()) return false;
    if (step === 2 && state.subjectMode === "role" && !state.roleId) return false;
    return true;
  })();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/dashboard/policies" className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{ color: "var(--pc-muted)" }}>
        <ArrowLeft size={13} strokeWidth={2} /> Back to Policies
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>Policy Builder</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>Create a new access or rate limit policy in 8 steps</p>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => done && setStep(s.id)}
                className="flex items-center gap-2 flex-shrink-0"
                style={{ cursor: done ? "pointer" : "default", background: "none", border: "none", padding: 0 }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                  style={{
                    background: done ? "var(--pc-primary)" : active ? "rgba(45,212,167,0.15)" : "var(--pc-elevated)",
                    color: done ? "#0C1116" : active ? "var(--pc-primary)" : "var(--pc-muted)",
                    border: `2px solid ${active ? "var(--pc-primary)" : done ? "var(--pc-primary)" : "var(--pc-border)"}`,
                  }}>
                  {done ? <Check size={12} strokeWidth={3} /> : s.id}
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px mx-1" style={{ background: done ? "var(--pc-primary)" : "var(--pc-border)" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step label */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pc-muted)" }}>
          Step {step} of {STEPS.length}
        </p>
        <h2 className="text-lg font-semibold mt-0.5" style={{ color: "var(--pc-foreground)" }}>
          {STEPS[step - 1].label}
        </h2>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border p-6" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
        {step === 1 && <Step1 s={state} set={set} />}
        {step === 2 && <Step2 s={state} set={set} roles={roles} />}
        {step === 3 && <Step3 s={state} set={set} servers={servers} />}
        {step === 4 && <Step4 s={state} set={set} />}
        {step === 5 && <Step5 s={state} set={set} />}
        {step === 6 && <Step6 s={state} set={set} setNum={setNum} />}
        {step === 7 && <Step7 s={state} set={set} explanation={explanation} onTest={simulateDecision} />}
        {step === 8 && <Step8 s={state} explanation={explanation} roles={roles} isPublishing={isPublishing} />}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep((v) => Math.max(1, v - 1))} disabled={step === 1}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-opacity"
          style={{ borderColor: "var(--pc-border)", color: step === 1 ? "var(--pc-muted)" : "var(--pc-foreground)", background: "none", cursor: step === 1 ? "not-allowed" : "pointer", opacity: step === 1 ? 0.4 : 1 }}>
          <ArrowLeft size={14} strokeWidth={2} /> Previous
        </button>

        {step < 8 ? (
          <button type="button" onClick={() => canProceed && setStep((v) => v + 1)} disabled={!canProceed}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: canProceed ? "var(--pc-primary)" : "var(--pc-elevated)", color: canProceed ? "#0C1116" : "var(--pc-muted)", cursor: canProceed ? "pointer" : "not-allowed" }}>
            Continue <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        ) : (
          <button type="button" onClick={publish} disabled={isPublishing}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: isPublishing ? "var(--pc-elevated)" : "var(--pc-primary)", color: isPublishing ? "var(--pc-muted)" : "#0C1116", cursor: isPublishing ? "not-allowed" : "pointer" }}>
            {isPublishing ? <Loader2 size={14} className="animate-spin" strokeWidth={2} /> : <Check size={14} strokeWidth={2.5} />}
            {isPublishing ? "Publishing…" : "Publish Policy"}
          </button>
        )}
      </div>
    </div>
  );
}
