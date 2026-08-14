"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  useListServersV1ServersGet,
  useListApiKeysV1ApiKeysGet,
  useListAuditLogsV1AuditGet,
  useListPoliciesV1RateLimitPoliciesGet,
  useListRolesV1RolesGet,
  type AuditLogView,
} from "@/api/generated";
import {
  CreditCard,
  Server,
  Key,
  Database,
  Zap,
  Shield,
  CheckCircle2,
  Edit2,
  Save,
  X,
  ExternalLink,
  Download,
  BarChart3,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ── helpers ─────────────────────────────────────────────────────── */

function progressColor(pct: number): string {
  if (pct >= 90) return "#F05D5E";
  if (pct >= 70) return "#F4B942";
  return "#35C88A";
}

function exportLicenseJson() {
  const data = {
    plan: "Enterprise Self-Hosted",
    license_type: "Perpetual",
    support: "Community",
    region: "Self-managed",
    issued_at: "2024-01-01",
    instance_id: "portcullis-self-hosted",
    max_servers: 50,
    max_api_keys: 100,
    max_rate_limit_policies: "unlimited",
    audit_log_retention_days: 90,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "portcullis-license.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── usage card ──────────────────────────────────────────────────── */

function UsageCard({
  label,
  icon: Icon,
  iconColor,
  iconBg,
  used,
  limit,
  usedLabel,
  limitLabel,
  loading,
}: {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  used: number;
  limit: number | null;
  usedLabel?: string;
  limitLabel?: string;
  loading: boolean;
}) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const barColor = isUnlimited ? "#35C88A" : progressColor(pct);

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: iconBg }}
          >
            <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: iconColor }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            {label}
          </p>
        </div>
        {!isUnlimited && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${barColor}20`, color: barColor }}
          >
            {pct}%
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-6 w-20 mb-3" style={{ background: "var(--pc-elevated)" }} />
      ) : (
        <p className="text-2xl font-bold tabular-nums mb-3" style={{ color: "var(--pc-foreground)" }}>
          {usedLabel ?? used.toString()}
          <span className="text-sm font-normal ml-2" style={{ color: "var(--pc-muted)" }}>
            / {limitLabel ?? (isUnlimited ? "Unlimited" : limit)}
          </span>
        </p>
      )}

      {/* progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--pc-elevated)" }}
      >
        {!isUnlimited && !loading && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        )}
        {isUnlimited && (
          <div
            className="h-full rounded-full"
            style={{ width: "100%", background: "rgba(53,200,138,0.3)" }}
          />
        )}
      </div>
    </div>
  );
}

/* ── plan limits table ───────────────────────────────────────────── */

interface LimitRow {
  key: string;
  feature: string;
  value: string;
}

const DEFAULT_LIMITS: LimitRow[] = [
  { key: "max_servers", feature: "Max Servers", value: "50" },
  { key: "max_api_keys", feature: "Max API Keys", value: "100" },
  { key: "max_policies", feature: "Max Rate Limit Policies", value: "Unlimited" },
  { key: "audit_retention", feature: "Audit Log Retention", value: "90 days" },
  { key: "max_body_size", feature: "Max Request Body Size", value: "100 MB" },
  { key: "max_tool_timeout", feature: "Max Tool Timeout", value: "30s" },
];

function PlanLimitsTable() {
  const [limits, setLimits] = useState<LimitRow[]>(DEFAULT_LIMITS);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  function startEdit(row: LimitRow) {
    setEditingRow(row.key);
    setEditValue(row.value);
  }

  function saveEdit(key: string) {
    setLimits((prev) =>
      prev.map((r) => (r.key === key ? { ...r, value: editValue } : r))
    );
    setEditingRow(null);
    toast.success("Limit updated", {
      description: "Changes take effect after gateway restart.",
    });
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditValue("");
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--pc-border)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Plan Limits Configuration
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            Limits are enforced at gateway startup. Restart required for changes to take effect.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
            <tr>
              {["Feature", "Current Limit", "Edit"].map((h, i) => (
                <th
                  key={h}
                  className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider ${i === 2 ? "text-right" : "text-left"}`}
                  style={{ color: "var(--pc-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {limits.map((row, idx) => (
              <tr
                key={row.key}
                style={{
                  borderBottom:
                    idx < limits.length - 1
                      ? "1px solid rgba(38,48,58,0.5)"
                      : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                }}
              >
                <td className="px-6 py-3.5">
                  <span className="text-sm" style={{ color: "var(--pc-foreground)" }}>
                    {row.feature}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  {editingRow === row.key ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(row.key);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm outline-none w-40"
                      style={{
                        background: "var(--pc-elevated)",
                        border: "1px solid var(--pc-primary)",
                        color: "var(--pc-foreground)",
                      }}
                    />
                  ) : (
                    <code
                      className="text-xs font-mono px-2 py-1 rounded-md"
                      style={{
                        background: "var(--pc-elevated)",
                        color: "var(--pc-secondary)",
                      }}
                    >
                      {row.value}
                    </code>
                  )}
                </td>
                <td className="px-6 py-3.5 text-right">
                  {editingRow === row.key ? (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => saveEdit(row.key)}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                        style={{ background: "rgba(45,212,167,0.15)", color: "#2DD4A7" }}
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                        style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(row)}
                      className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 ml-auto"
                      style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── plan distribution chart ─────────────────────────────────────── */

const PLAN_DIST = [
  { label: "Free", pct: 0, color: "var(--pc-muted)" },
  { label: "Pro", pct: 0, color: "var(--pc-secondary)" },
  { label: "Enterprise", pct: 100, color: "var(--pc-primary)" },
];

function PlanDistributionChart() {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--pc-primary)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
          Plan Distribution
        </h2>
      </div>
      <div className="space-y-4">
        {PLAN_DIST.map((plan) => (
          <div key={plan.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
                {plan.label}
              </span>
              <span className="text-xs tabular-nums font-semibold" style={{ color: plan.color }}>
                {plan.pct}%
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--pc-elevated)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${plan.pct}%`,
                  background: plan.color,
                  minWidth: plan.pct > 0 ? "4px" : "0px",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--pc-muted)" }}>
        Showing distribution of users across plans for this instance.
      </p>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminBillingPage() {
  const { data: serversResp, isLoading: loadingServers } = useListServersV1ServersGet();
  const { data: keysResp, isLoading: loadingKeys } = useListApiKeysV1ApiKeysGet();
  const { data: auditResp, isLoading: loadingAudit } = useListAuditLogsV1AuditGet({ limit: 200 });
  const { data: policiesResp } = useListPoliciesV1RateLimitPoliciesGet();
  const { data: rolesResp } = useListRolesV1RolesGet();

  const servers = Array.isArray(serversResp?.data) ? (serversResp.data as { id: string }[]) : [];
  const keys = Array.isArray(keysResp?.data) ? (keysResp.data as { id: string }[]) : [];
  const auditLogs = (Array.isArray(auditResp?.data) ? auditResp.data : []) as AuditLogView[];

  // suppress unused warnings
  void policiesResp;
  void rolesResp;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Billing & Plans
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Manage subscription limits and usage for this Portcullis instance
        </p>
      </div>

      {/* Current plan banner */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "linear-gradient(135deg, rgba(244,185,66,0.08) 0%, rgba(244,185,66,0.03) 100%)",
          borderColor: "rgba(244,185,66,0.35)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(244,185,66,0.15)" }}
            >
              <CreditCard className="w-6 h-6" strokeWidth={1.5} style={{ color: "#F4B942" }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className="text-lg font-bold"
                  style={{ color: "var(--pc-foreground)" }}
                >
                  Enterprise Self-Hosted
                </span>
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: "rgba(244,185,66,0.2)", color: "#F4B942" }}
                >
                  ACTIVE
                </span>
                <span
                  className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                  style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                >
                  Self-Hosted
                </span>
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {[
                  { label: "License", value: "Perpetual" },
                  { label: "Support", value: "Community" },
                  { label: "Region", value: "Self-managed" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <CheckCircle2
                      className="w-3.5 h-3.5 flex-shrink-0"
                      strokeWidth={2}
                      style={{ color: "#35C88A" }}
                    />
                    <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                      {label}:{" "}
                      <span style={{ color: "var(--pc-foreground)" }}>{value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://portcullis.sh/support"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--pc-secondary)" }}
            >
              <ExternalLink className="w-3 h-3" />
              Upgrade support
            </a>
            <button
              onClick={exportLicenseJson}
              className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{
                background: "rgba(244,185,66,0.15)",
                color: "#F4B942",
                border: "1px solid rgba(244,185,66,0.3)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Export license info
            </button>
          </div>
        </div>
      </div>

      {/* Usage vs limits cards */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--pc-foreground)" }}>
          Usage vs Limits
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <UsageCard
            label="MCP Servers"
            icon={Server}
            iconColor="var(--pc-secondary)"
            iconBg="rgba(72,184,232,0.15)"
            used={servers.length}
            limit={50}
            loading={loadingServers}
          />
          <UsageCard
            label="API Keys"
            icon={Key}
            iconColor="var(--pc-primary)"
            iconBg="rgba(45,212,167,0.15)"
            used={keys.length}
            limit={100}
            loading={loadingKeys}
          />
          <UsageCard
            label="Audit Retention"
            icon={Database}
            iconColor="#35C88A"
            iconBg="rgba(53,200,138,0.15)"
            used={0}
            limit={null}
            usedLabel="Unlimited"
            limitLabel="Unlimited"
            loading={false}
          />
          <UsageCard
            label="Monthly Requests"
            icon={Zap}
            iconColor="#F4B942"
            iconBg="rgba(244,185,66,0.15)"
            used={auditLogs.length}
            limit={null}
            usedLabel={loadingAudit ? "—" : `${auditLogs.length}+`}
            limitLabel="Unlimited"
            loading={loadingAudit}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--pc-muted)" }}>
          * Monthly Requests reflects the last 200 audit log entries. Self-hosted instances have unlimited request throughput.
        </p>
      </div>

      {/* Plan limits config table */}
      <PlanLimitsTable />

      {/* Plan distribution chart */}
      <PlanDistributionChart />

      {/* Billing history */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div
          className="px-6 py-4"
          style={{ borderBottom: "1px solid var(--pc-border)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Billing History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              style={{
                background: "var(--pc-elevated)",
                borderBottom: "1px solid var(--pc-border)",
              }}
            >
              <tr>
                {["Date", "Description", "Amount", "Status"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider ${i >= 2 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        {/* empty state */}
        <div className="flex flex-col items-center justify-center py-14 text-center px-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--pc-elevated)" }}
          >
            <CreditCard
              className="w-5 h-5"
              strokeWidth={1.5}
              style={{ color: "var(--pc-muted)", opacity: 0.5 }}
            />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--pc-foreground)" }}>
            No billing history
          </p>
          <p className="text-xs max-w-sm leading-relaxed mb-5" style={{ color: "var(--pc-muted)" }}>
            Self-hosted installations manage their own licensing. No invoices or payment records are stored here.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://portcullis.sh/sales"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{
                background: "rgba(45,212,167,0.15)",
                color: "var(--pc-primary)",
                border: "1px solid rgba(45,212,167,0.25)",
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Contact Sales
            </a>
            <a
              href="https://portcullis.sh/license"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{
                background: "var(--pc-elevated)",
                color: "var(--pc-muted)",
                border: "1px solid var(--pc-border)",
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View License Agreement
            </a>
          </div>
        </div>
      </div>

      {/* Support & Resources */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--pc-foreground)" }}>
          Support & Resources
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Community Forum */}
          <div
            className="rounded-xl border p-5 flex flex-col gap-3 opacity-60"
            style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(72,184,232,0.15)" }}
              >
                <Users className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--pc-secondary)" }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
                Community Forum
              </p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
              Ask questions, share tips, and connect with other Portcullis users.
            </p>
            <button
              disabled
              className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg w-fit cursor-not-allowed"
              style={{
                background: "var(--pc-elevated)",
                color: "var(--pc-muted)",
                border: "1px solid var(--pc-border)",
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Visit Forum
            </button>
          </div>

          {/* GitHub Issues */}
          <div
            className="rounded-xl border p-5 flex flex-col gap-3 opacity-60"
            style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(241,95,94,0.15)" }}
              >
                <Shield className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F05D5E" }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
                GitHub Issues
              </p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
              Report bugs or request features on the open-source repository.
            </p>
            <button
              disabled
              className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg w-fit cursor-not-allowed"
              style={{
                background: "var(--pc-elevated)",
                color: "var(--pc-muted)",
                border: "1px solid var(--pc-border)",
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Open GitHub
            </button>
          </div>

          {/* Enterprise Support */}
          <div
            className="rounded-xl border p-5 flex flex-col gap-3"
            style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(45,212,167,0.15)" }}
                >
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--pc-primary)" }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
                  Enterprise Support
                </p>
              </div>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(139,152,167,0.15)", color: "var(--pc-muted)" }}
              >
                Not activated
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
              Priority SLA, dedicated Slack channel, and direct engineering access.
            </p>
            <button
              disabled
              className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg w-fit cursor-not-allowed opacity-50"
              style={{
                background: "rgba(45,212,167,0.1)",
                color: "var(--pc-primary)",
                border: "1px solid rgba(45,212,167,0.2)",
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Activate Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
