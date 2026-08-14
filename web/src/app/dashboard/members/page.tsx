"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Key,
  Shield,
  ShieldCheck,
  Trash2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Search,
  UserPlus,
  Activity,
  Clock,
  Mail,
} from "lucide-react";
import {
  useListApiKeysV1ApiKeysGet,
  useCreateApiKeyV1ApiKeysPost,
  useRevokeApiKeyV1ApiKeysKeyIdDelete,
  useListRolesV1RolesGet,
  useCreateBindingV1RolesRoleIdBindingsPost,
  useListAuditLogsV1AuditGet,
  type ApiKeyView,
  type RoleView,
  type ApiKeyCreateResponse,
} from "@/api/generated";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";

/* ── constants ────────────────────────────────────────────────────────────── */

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--pc-elevated)",
  border: "1px solid var(--pc-border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--pc-foreground)",
  width: "100%",
  outline: "none",
};

const ENV_MAP: Record<string, { label: string; color: string }> = {
  production: { label: "Production", color: "var(--pc-critical)" },
  staging: { label: "Staging", color: "var(--pc-warning)" },
  development: { label: "Development", color: "var(--pc-secondary)" },
  local: { label: "Local", color: "var(--pc-muted)" },
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/* ── helpers ─────────────────────────────────────────────────────────────── */

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function buildScopes(env: string): string[] {
  const scopes: string[] = [];
  if (env) scopes.push(`env:${env}`);
  scopes.push("server:*");
  scopes.push("tool:*");
  return scopes;
}

/* ── sub-components ──────────────────────────────────────────────────────── */

function EnvBadge({ env }: { env: string }) {
  const e = ENV_MAP[env] ?? { label: env, color: "var(--pc-muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${e.color}22`,
        color: e.color,
        border: `1px solid ${e.color}44`,
      }}
    >
      {e.label}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-3"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums" style={{ color: "var(--pc-foreground)" }}>
          {value}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

/* ── assign role dialog ──────────────────────────────────────────────────── */

function AssignRoleDialog({
  open,
  onClose,
  member,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  member: ApiKeyView | null;
  roles: RoleView[];
}) {
  const qc = useQueryClient();
  const createBinding = useCreateBindingV1RolesRoleIdBindingsPost();
  const [selectedRoleId, setSelectedRoleId] = useState("");

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !selectedRoleId) return;
    try {
      await createBinding.mutateAsync({
        roleId: selectedRoleId,
        data: { subject_id: member.id, subject_type: "api_key" },
      });
      toast.success(`Role assigned to "${member.name}"`);
      qc.invalidateQueries({ queryKey: ["/v1/roles"] });
      onClose();
      setSelectedRoleId("");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to assign role"
      );
    }
  }

  function handleClose() {
    onClose();
    setSelectedRoleId("");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md rounded-2xl border"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2.5 text-base"
            style={{ color: "var(--pc-foreground)" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(45,212,167,0.15)" }}
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
            </div>
            Assign Role
          </DialogTitle>
        </DialogHeader>

        {member && (
          <div
            className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(72,184,232,0.15)" }}
            >
              <Key className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                {member.name}
              </div>
              <code
                className="text-xs font-mono"
                style={{ color: "var(--pc-muted)" }}
              >
                {member.key_prefix}…
              </code>
            </div>
          </div>
        )}

        <form onSubmit={handleAssign} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--pc-muted)" }}
            >
              Role
            </Label>
            {roles.length === 0 ? (
              <div
                className="text-sm p-3 rounded-xl text-center"
                style={{ color: "var(--pc-muted)", background: "var(--pc-elevated)" }}
              >
                No roles defined yet. Create a role first.
              </div>
            ) : (
              <div className="space-y-1.5">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-colors"
                    style={{
                      background:
                        selectedRoleId === role.id
                          ? "rgba(45,212,167,0.12)"
                          : "var(--pc-elevated)",
                      border: `1px solid ${selectedRoleId === role.id ? "var(--pc-primary)" : "var(--pc-border)"}`,
                      color:
                        selectedRoleId === role.id
                          ? "var(--pc-primary)"
                          : "var(--pc-foreground)",
                    }}
                  >
                    <Shield className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
                    <span className="text-sm font-medium">{role.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm transition-colors"
              style={{ color: "var(--pc-muted)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedRoleId || createBinding.isPending || roles.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {createBinding.isPending ? "Assigning…" : "Assign Role"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── revoke confirm dialog ───────────────────────────────────────────────── */

function RevokeDialog({
  open,
  onClose,
  member,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  member: ApiKeyView | null;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-sm rounded-2xl border"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2.5 text-base"
            style={{ color: "var(--pc-foreground)" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(240,93,94,0.15)" }}
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--pc-critical)" }} />
            </div>
            Revoke Member
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div
            className="flex items-start gap-2.5 p-3 rounded-xl"
            style={{ background: "rgba(240,93,94,0.08)", border: "1px solid rgba(240,93,94,0.25)" }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--pc-critical)" }} />
            <p className="text-xs leading-relaxed" style={{ color: "var(--pc-critical)" }}>
              This will permanently revoke{" "}
              <strong>{member?.name}</strong>&apos;s access. Any active sessions using this key
              will immediately fail. This cannot be undone.
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: "var(--pc-muted)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: "var(--pc-critical)", color: "#fff" }}
          >
            {isPending ? "Revoking…" : "Revoke Access"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── invite member dialog ────────────────────────────────────────────────── */

function InviteMemberDialog({
  open,
  onClose,
  roles,
  bulk,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleView[];
  bulk?: boolean;
}) {
  const qc = useQueryClient();
  const createKey = useCreateApiKeyV1ApiKeysPost();
  const createBinding = useCreateBindingV1RolesRoleIdBindingsPost();

  const [name, setName] = useState("");
  const [bulkNames, setBulkNames] = useState("");
  const [environment, setEnvironment] = useState<"production" | "staging" | "development" | "local" | "">("");
  const [roleId, setRoleId] = useState("");
  const [createdKeys, setCreatedKeys] = useState<Array<{ name: string; plaintext: string }>>([]);
  const [done, setDone] = useState(false);

  const envOptions = [
    { value: "production" as const, label: "Production", color: "var(--pc-critical)" },
    { value: "staging" as const, label: "Staging", color: "var(--pc-warning)" },
    { value: "development" as const, label: "Development", color: "var(--pc-secondary)" },
    { value: "local" as const, label: "Local", color: "var(--pc-muted)" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const names = bulk
      ? bulkNames.split("\n").map((n) => n.trim()).filter(Boolean)
      : [name.trim()];

    if (names.length === 0) return;

    const results: Array<{ name: string; plaintext: string }> = [];

    for (const n of names) {
      try {
        const scopes = buildScopes(environment);
        const res = await createKey.mutateAsync({ data: { name: n, scopes } });
        const resp = res?.data as ApiKeyCreateResponse | undefined;
        const plaintext = resp?.plaintext;
        const keyId = (resp as { id?: string })?.id;

        if (plaintext) {
          results.push({ name: n, plaintext });
        }

        if (keyId && roleId) {
          try {
            await createBinding.mutateAsync({
              roleId,
              data: { subject_id: keyId, subject_type: "api_key" },
            });
          } catch {
            // Role binding failure is non-fatal — key is still created
          }
        }
      } catch (err: unknown) {
        toast.error(
          `Failed to create "${n}": ` +
            ((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
              "Unknown error")
        );
      }
    }

    if (results.length > 0) {
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
      qc.invalidateQueries({ queryKey: ["/v1/roles"] });
      setCreatedKeys(results);
      setDone(true);
      toast.success(
        bulk
          ? `${results.length} member${results.length > 1 ? "s" : ""} invited`
          : `"${results[0].name}" invited`
      );
    }
  }

  function handleClose() {
    onClose();
    setTimeout(() => {
      setName("");
      setBulkNames("");
      setEnvironment("");
      setRoleId("");
      setCreatedKeys([]);
      setDone(false);
    }, 300);
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success("Key copied to clipboard");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg rounded-2xl border"
        style={{
          background: "var(--pc-surface)",
          borderColor: "var(--pc-border)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2.5 text-base"
            style={{ color: "var(--pc-foreground)" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(45,212,167,0.15)" }}
            >
              <UserPlus className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
            </div>
            {bulk ? "Bulk Invite Members" : "Invite Member"}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2">
            <div
              className="flex items-center gap-2 p-3 rounded-xl"
              style={{ background: "rgba(53,200,138,0.1)", border: "1px solid rgba(53,200,138,0.25)" }}
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--pc-success)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--pc-success)" }}>
                {createdKeys.length} member{createdKeys.length > 1 ? "s" : ""} created successfully
              </span>
            </div>

            <div
              className="p-3 rounded-xl"
              style={{ background: "rgba(244,185,66,0.08)", border: "1px solid rgba(244,185,66,0.25)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--pc-warning)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--pc-warning)" }}>
                  Save these keys now — they won&apos;t be shown again
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {createdKeys.map((k) => (
                <div
                  key={k.name}
                  className="p-3 rounded-xl"
                  style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
                >
                  <div
                    className="text-xs font-semibold mb-1.5"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {k.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <code
                      className="flex-1 text-xs font-mono break-all leading-relaxed"
                      style={{ color: "var(--pc-primary)" }}
                    >
                      {k.plaintext}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyKey(k.plaintext)}
                      className="flex-shrink-0 p-1.5 rounded-md transition-colors"
                      style={{ background: "var(--pc-surface)", color: "var(--pc-muted)" }}
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {bulk ? (
              <div className="space-y-1.5">
                <Label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--pc-muted)" }}
                >
                  Member Names (one per line)
                </Label>
                <textarea
                  value={bulkNames}
                  onChange={(e) => setBulkNames(e.target.value)}
                  placeholder={"CI Pipeline\nProduction Agent\nStaging Worker"}
                  rows={6}
                  required
                  style={{ ...INPUT_STYLE, resize: "none" }}
                />
                <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  {bulkNames.split("\n").filter((n) => n.trim()).length} member
                  {bulkNames.split("\n").filter((n) => n.trim()).length !== 1 ? "s" : ""} to
                  create
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--pc-muted)" }}
                >
                  Member Name
                </Label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CI Pipeline, Production Agent"
                  required
                  style={INPUT_STYLE}
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--pc-muted)" }}
              >
                Environment
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {envOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setEnvironment(environment === opt.value ? "" : opt.value)
                    }
                    className="flex items-center gap-2 p-2.5 rounded-lg text-left transition-colors"
                    style={{
                      border: `1px solid ${environment === opt.value ? opt.color : "var(--pc-border)"}`,
                      background:
                        environment === opt.value ? `${opt.color}18` : "var(--pc-elevated)",
                      color:
                        environment === opt.value ? opt.color : "var(--pc-muted)",
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: opt.color }}
                    />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {roles.length > 0 && (
              <div className="space-y-1.5">
                <Label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--pc-muted)" }}
                >
                  Assign Role (optional)
                </Label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  style={{ ...INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="">No role — assign later</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: "var(--pc-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createKey.isPending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                {createKey.isPending
                  ? "Creating…"
                  : bulk
                  ? "Create All"
                  : "Invite Member"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── member row ──────────────────────────────────────────────────────────── */

interface MemberRowProps {
  member: ApiKeyView;
  lastActiveAt: string | null;
  onAssignRole: (member: ApiKeyView) => void;
  onRevoke: (member: ApiKeyView) => void;
}

function MemberRow({ member, lastActiveAt, onAssignRole, onRevoke }: MemberRowProps) {
  const envScope = member.scopes.find((s) => s.startsWith("env:"))?.replace("env:", "");
  const displayScopes = member.scopes.filter((s) => !s.startsWith("env:") && !s.startsWith("owner:"));
  const visibleScopes = displayScopes.slice(0, 3);
  const overflowCount = displayScopes.length - visibleScopes.length;
  const isActive = !!member.last_used_at;
  const isActiveRecently =
    member.last_used_at &&
    Date.now() - new Date(member.last_used_at).getTime() < THIRTY_DAYS_MS;

  function handleViewActivity() {
    window.location.href = `/dashboard/audit?subject=${member.id}`;
  }

  function handleResend() {
    toast.info("Invitations are sent via API key — share the key directly with the member.");
  }

  return (
    <tr
      className="transition-colors group hover:brightness-110"
      style={{ borderBottom: "1px solid var(--pc-border)" }}
    >
      {/* Name / Key */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(72,184,232,0.15)" }}
          >
            <Key className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              {member.name}
            </div>
            <code className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
              {member.key_prefix}…
            </code>
          </div>
        </div>
      </td>

      {/* Environment */}
      <td className="px-5 py-3.5">
        {envScope ? (
          <EnvBadge env={envScope} />
        ) : (
          <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
            —
          </span>
        )}
      </td>

      {/* Role */}
      <td className="px-5 py-3.5">
        <button
          type="button"
          onClick={() => onAssignRole(member)}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors hover:opacity-80"
          style={{
            background: "rgba(45,212,167,0.1)",
            color: "var(--pc-primary)",
            border: "1px solid rgba(45,212,167,0.2)",
          }}
        >
          <Shield className="w-3 h-3" strokeWidth={2} />
          Assign Role
        </button>
      </td>

      {/* Scopes */}
      <td className="px-5 py-3.5">
        <div className="flex flex-wrap gap-1">
          {visibleScopes.map((s) => (
            <span
              key={s}
              className="text-xs font-mono px-1.5 py-0.5 rounded-md"
              style={{ background: "rgba(72,184,232,0.12)", color: "#48B8E8" }}
            >
              {s}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
              +{overflowCount}
            </span>
          )}
          {displayScopes.length === 0 && (
            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
              —
            </span>
          )}
        </div>
      </td>

      {/* Last Active */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 flex-shrink-0" style={{ color: "var(--pc-muted)" }} />
          <span className="text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
            {lastActiveAt ? formatRelativeTime(lastActiveAt) : "Never"}
          </span>
        </div>
      </td>

      {/* Status */}
      <td className="px-5 py-3.5">
        {isActive ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              background: isActiveRecently
                ? "rgba(53,200,138,0.12)"
                : "rgba(244,185,66,0.12)",
              color: isActiveRecently ? "var(--pc-success)" : "var(--pc-warning)",
            }}
          >
            <Activity className="w-2.5 h-2.5" strokeWidth={2.5} />
            {isActiveRecently ? "Active" : "Inactive"}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: "rgba(139,152,167,0.12)", color: "var(--pc-muted)" }}
          >
            Never used
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleViewActivity}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--pc-muted)", background: "var(--pc-elevated)" }}
            title="View audit activity"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResend}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--pc-muted)", background: "var(--pc-elevated)" }}
            title="Resend invitation info"
          >
            <Mail className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRevoke(member)}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--pc-critical)", background: "rgba(240,93,94,0.1)" }}
            title="Revoke access"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function MembersPage() {
  const qc = useQueryClient();

  const { data: keysResp, isLoading: keysLoading } = useListApiKeysV1ApiKeysGet();
  const { data: rolesResp } = useListRolesV1RolesGet();
  const { data: auditResp } = useListAuditLogsV1AuditGet({ limit: 200 });

  const revokeKey = useRevokeApiKeyV1ApiKeysKeyIdDelete();

  const members = useMemo(
    () => (keysResp?.data ?? []) as ApiKeyView[],
    [keysResp]
  );
  const roles = useMemo(
    () => (rolesResp?.data ?? []) as RoleView[],
    [rolesResp]
  );

  // Build a map of subject_id -> most recent audit log created_at
  const lastActiveMap = useMemo(() => {
    const map: Record<string, string> = {};
    const logs = (auditResp?.data ?? []) as Array<{ subject_id: string | null; created_at: string }>;
    for (const log of logs) {
      if (!log.subject_id) continue;
      const existing = map[log.subject_id];
      if (!existing || log.created_at > existing) {
        map[log.subject_id] = log.created_at;
      }
    }
    return map;
  }, [auditResp]);

  // Stats
  const stats = useMemo(() => {
    const now = Date.now();
    const active = members.filter(
      (m) => m.last_used_at && now - new Date(m.last_used_at).getTime() < THIRTY_DAYS_MS
    ).length;
    const neverUsed = members.filter((m) => !m.last_used_at).length;
    return {
      total: members.length,
      active,
      roles: roles.length,
      neverUsed,
    };
  }, [members, roles]);

  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [assignRoleTarget, setAssignRoleTarget] = useState<ApiKeyView | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyView | null>(null);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.key_prefix.toLowerCase().includes(q) ||
        m.scopes.some((s) => s.toLowerCase().includes(q))
    );
  }, [members, search]);

  async function handleRevoke() {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync({ keyId: revokeTarget.id });
      toast.success(`"${revokeTarget.name}" revoked`);
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
      setRevokeTarget(null);
    } catch {
      toast.error("Failed to revoke access");
    }
  }

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            Team Members
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            API keys that authenticate with the gateway — each key is a member identity
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setBulkInviteOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:opacity-80"
            style={{
              color: "var(--pc-foreground)",
              borderColor: "var(--pc-border)",
              background: "var(--pc-surface)",
            }}
          >
            <Users className="w-4 h-4" />
            Bulk Invite
          </button>
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Invite Member
          </button>
        </div>
      </div>

      {/* ── stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Total Members"
          value={stats.total}
          color="var(--pc-secondary)"
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Active (30d)"
          value={stats.active}
          color="var(--pc-success)"
        />
        <StatCard
          icon={<ShieldCheck className="w-5 h-5" />}
          label="Roles Configured"
          value={stats.roles}
          color="var(--pc-primary)"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Never Used"
          value={stats.neverUsed}
          color="var(--pc-warning)"
        />
      </div>

      {/* ── search bar ── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--pc-muted)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members by name, key prefix, or scope…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--pc-foreground)" }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-xs"
            style={{ color: "var(--pc-muted)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── table ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {keysLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--pc-elevated)" }}
            >
              <Users
                className="w-5 h-5"
                strokeWidth={1.5}
                style={{ color: "var(--pc-muted)" }}
              />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              {search ? "No members match your search" : "No members yet"}
            </p>
            <p className="text-xs mt-1 mb-5" style={{ color: "var(--pc-muted)" }}>
              {search
                ? "Try a different search term"
                : "Invite your first member to get started"}
            </p>
            {!search && (
              <button
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--pc-primary)" }}
              >
                <Plus className="w-4 h-4" /> Invite Member
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--pc-elevated)" }}>
                <tr>
                  {[
                    "Name / Key",
                    "Environment",
                    "Role",
                    "Scopes",
                    "Last Active",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    lastActiveAt={lastActiveMap[member.id] ?? null}
                    onAssignRole={setAssignRoleTarget}
                    onRevoke={setRevokeTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── footer note ── */}
      {members.length > 0 && (
        <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
          Showing {filteredMembers.length} of {members.length} member
          {members.length !== 1 ? "s" : ""}. Last active is derived from the most recent audit log
          entry per key.
        </p>
      )}

      {/* ── dialogs ── */}
      <InviteMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roles={roles}
      />
      <InviteMemberDialog
        open={bulkInviteOpen}
        onClose={() => setBulkInviteOpen(false)}
        roles={roles}
        bulk
      />
      <AssignRoleDialog
        open={!!assignRoleTarget}
        onClose={() => setAssignRoleTarget(null)}
        member={assignRoleTarget}
        roles={roles}
      />
      <RevokeDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        member={revokeTarget}
        onConfirm={handleRevoke}
        isPending={revokeKey.isPending}
      />
    </div>
  );
}
