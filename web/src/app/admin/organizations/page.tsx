"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  useListTenantsAdminTenantsGet,
  provisionTenantAdminTenantsPost,
  type TenantProvisionResponse,
  type TenantView,
} from "@/api/generated";
import {
  Building2,
  ExternalLink,
  Plus,
  Loader2,
  Copy,
  Check,
  Settings,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

/* ── helpers ─────────────────────────────────────────────────────── */

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function planBadge(plan: string | null | undefined) {
  if (plan === "enterprise")
    return { bg: "rgba(244,185,66,0.15)", fg: "#F4B942" };
  if (plan === "pro")
    return { bg: "rgba(45,212,167,0.15)", fg: "#2DD4A7" };
  return { bg: "var(--pc-elevated)", fg: "var(--pc-muted)" };
}

/* ── stat card ───────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number;
  loading: boolean;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <p
        className="text-xs font-medium uppercase tracking-widest mb-2"
        style={{ color: "var(--pc-muted)" }}
      >
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-8 w-14 mt-1" style={{ background: "var(--pc-elevated)" }} />
      ) : (
        <p
          className="text-3xl font-bold tabular-nums"
          style={{ color: accent ?? "var(--pc-foreground)" }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

/* ── provision dialog ────────────────────────────────────────────── */

const PLAN_OPTIONS = [
  { value: "community", label: "Community" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--pc-elevated)",
  border: "1px solid var(--pc-border)",
  borderRadius: 10,
  color: "var(--pc-foreground)",
  fontSize: 13,
  outline: "none",
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span
        className="text-xs font-medium uppercase tracking-widest mb-1.5 block"
        style={{ color: "var(--pc-muted)" }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs mt-1 block" style={{ color: "var(--pc-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function CredentialRow({
  label,
  value,
  monospace = true,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--pc-muted)" }}>
          {label}
        </span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs transition-colors"
          style={{ color: copied ? "#2DD4A7" : "var(--pc-primary)" }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p
        className={`text-xs leading-relaxed break-all ${monospace ? "font-mono" : ""}`}
        style={{ color: "var(--pc-foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}

function ProvisionDialog({
  open,
  onClose,
  onProvisioned,
}: {
  open: boolean;
  onClose: () => void;
  onProvisioned: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [plan, setPlan] = useState("pro");
  const [seatLimit, setSeatLimit] = useState("5");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TenantProvisionResponse | null>(null);

  function reset() {
    setName("");
    setSlug("");
    setOwnerEmail("");
    setOwnerFullName("");
    setPlan("pro");
    setSeatLimit("5");
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !slug.trim() || !ownerEmail.trim() || !ownerFullName.trim()) return;
    setBusy(true);
    try {
      const resp = await provisionTenantAdminTenantsPost({
        name: name.trim(),
        slug: slug.trim(),
        owner_email: ownerEmail.trim(),
        owner_full_name: ownerFullName.trim(),
        plan: plan as TenantProvisionResponse["license"]["plan"],
        seat_limit: parseInt(seatLimit || "5", 10),
      });
      if (resp.status !== 201) {
        throw new Error(
          (resp.data as { detail?: string })?.detail ?? "Provision failed"
        );
      }
      setResult(resp.data);
      toast.success(`Organization "${name.trim()}" provisioned`);
      onProvisioned();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to provision organization"
      );
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result ? "Organization provisioned" : "New Organization"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "One-time credentials for the new owner. Copy them now — they are shown only once."
              : "Provision a new managed tenant with an owner account and platform license."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <CredentialRow label="Owner email" value={result.owner.email} monospace={false} />
            <CredentialRow label="Access token" value={result.access_token} />
            {result.owner_password && (
              <CredentialRow label="Owner password (generated)" value={result.owner_password} />
            )}
            <CredentialRow label="License key" value={result.license_key} />
            <p
              className="text-xs"
              style={{ color: "var(--pc-muted)" }}
            >
              Plan: {result.license.plan} · Seat limit: {result.license.seat_limit}
            </p>
          </div>
        ) : (
          <form id="provision-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Organization name">
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc"
                required
              />
            </Field>
            <Field label="Slug" hint="Unique lowercase identifier used in URLs and API keys.">
              <input
                style={inputStyle}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="acme"
                required
              />
            </Field>
            <Field label="Owner email">
              <input
                style={inputStyle}
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@acme.com"
                required
              />
            </Field>
            <Field label="Owner full name">
              <input
                style={inputStyle}
                value={ownerFullName}
                onChange={(e) => setOwnerFullName(e.target.value)}
                placeholder="Ada Owner"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan">
                <select
                  style={inputStyle}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                >
                  {PLAN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seat limit">
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={seatLimit}
                  onChange={(e) => setSeatLimit(e.target.value)}
                />
              </Field>
            </div>
          </form>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" form="provision-form" disabled={busy}>
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {busy ? "Provisioning…" : "Provision"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminOrganizationsPage() {
  const [provisionOpen, setProvisionOpen] = useState(false);

  const { data: tenantsResp, isLoading, refetch } = useListTenantsAdminTenantsGet();

  const tenants = (tenantsResp?.data ?? []) as TenantView[];

  const activeCount = tenants.length;

  return (
    <div className="space-y-8" style={{ position: "relative" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Organizations
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Manage customer organizations across the platform
          </p>
        </div>

        <Button onClick={() => setProvisionOpen(true)}>
          <Plus className="w-4 h-4" />
          New Organization
        </Button>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Organizations" value={tenants.length} loading={isLoading} />
        <StatCard label="Active" value={activeCount} loading={isLoading} accent="#35C88A" />
        <StatCard label="Pro" value={tenants.filter((t) => t.plan === "pro").length} loading={isLoading} />
        <StatCard label="Enterprise" value={tenants.filter((t) => t.plan === "enterprise").length} loading={isLoading} />
      </div>

      {/* ── Organizations table ─────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              style={{
                background: "var(--pc-elevated)",
                borderBottom: "1px solid var(--pc-border)",
              }}
            >
              <tr>
                {[
                  "Organization",
                  "Plan",
                  "Created",
                  "Last Activity",
                  "",
                ].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                      i === 4 ? "text-right" : "text-left"
                    }`}
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-4">
                    <div className="space-y-3">
                      {[...Array(2)].map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-14 w-full rounded-xl"
                          style={{ background: "var(--pc-elevated)" }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      compact
                      icon={Building2}
                      title="No organizations yet"
                      description="Provision your first managed tenant to get started."
                      actions={[
                        {
                          label: "New Organization",
                          variant: "primary",
                          onClick: () => setProvisionOpen(true),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => {
                  const pBadge = planBadge(tenant.plan);
                  return (
                    <tr
                      key={tenant.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "";
                      }}
                    >
                      {/* Organization name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(45,212,167,0.15)" }}
                          >
                            <Building2
                              className="w-4 h-4"
                              strokeWidth={1.75}
                              style={{ color: "#2DD4A7" }}
                            />
                          </div>
                          <div>
                            <p
                              className="text-sm font-semibold"
                              style={{ color: "var(--pc-foreground)" }}
                            >
                              {tenant.name}
                            </p>
                            <p className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
                              {tenant.slug}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: pBadge.bg, color: pBadge.fg }}
                        >
                          {tenant.plan ? tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1) : "—"}
                        </span>
                      </td>

                      {/* Created */}
                      <td
                        className="px-5 py-4 text-xs tabular-nums whitespace-nowrap"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {fmtDate(tenant.created_at)}
                      </td>

                      {/* Last activity */}
                      <td
                        className="px-5 py-4 text-xs tabular-nums whitespace-nowrap"
                        style={{ color: "var(--pc-muted)" }}
                      >
                        {fmtDateTime(tenant.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href="/dashboard"
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            style={{
                              background: "rgba(45,212,167,0.12)",
                              color: "#2DD4A7",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLAnchorElement).style.background =
                                "rgba(45,212,167,0.2)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLAnchorElement).style.background =
                                "rgba(45,212,167,0.12)";
                            }}
                          >
                            <ExternalLink className="w-3 h-3" strokeWidth={2} />
                            Open
                          </Link>
                          <Link
                            href="/admin/settings"
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            style={{
                              background: "var(--pc-elevated)",
                              color: "var(--pc-muted)",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLAnchorElement).style.background =
                                "rgba(255,255,255,0.06)";
                              (e.currentTarget as HTMLAnchorElement).style.color =
                                "var(--pc-foreground)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLAnchorElement).style.background =
                                "var(--pc-elevated)";
                              (e.currentTarget as HTMLAnchorElement).style.color =
                                "var(--pc-muted)";
                            }}
                          >
                            <Settings className="w-3 h-3" strokeWidth={2} />
                            Settings
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {!isLoading && tenants.length > 0 && (
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--pc-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Showing {tenants.length} of {tenants.length} organization{tenants.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Managed tenants
            </p>
          </div>
        )}
      </div>

      {/* ── Provision dialog ────────────────────────────────────── */}
      <ProvisionDialog
        open={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        onProvisioned={() => void refetch()}
      />
    </div>
  );
}