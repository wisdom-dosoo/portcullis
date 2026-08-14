"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  UserPlus,
  Wrench,
  Server,
  Key,
  Lock,
  Layers,
  Star,
  RefreshCw,
} from "lucide-react";
import {
  useListRolesV1RolesGet,
  useCreateRoleV1RolesPost,
  useCreateBindingV1RolesRoleIdBindingsPost,
  useCreatePermissionV1RolesRoleIdPermissionsPost,
  useDeletePermissionV1RolesRoleIdPermissionsPermissionIdDelete,
  useListApiKeysV1ApiKeysGet,
  useListAuditLogsV1AuditGet,
  type RoleView,
  type ApiKeyView,
  type ToolPermissionView,
  PermissionEffect,
  SubjectType,
} from "@/api/generated";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/* ── constants ───────────────────────────────────────────────────────────── */

const BUILTIN_ROLES = [
  {
    id: "__admin__",
    name: "Admin",
    description: "Full access to all servers, tools, policies, and settings.",
    server_pattern: "*",
    tool_pattern: "*",
    effect: "allow" as const,
    color: "var(--pc-critical)",
    icon: <ShieldAlert size={18} />,
    inherit: "Inherits all permissions. Cannot be modified.",
  },
  {
    id: "__developer__",
    name: "Developer",
    description: "Access to all MCP tool calls. No billing or member management.",
    server_pattern: "*",
    tool_pattern: "*",
    effect: "allow" as const,
    color: "var(--pc-primary)",
    icon: <ShieldCheck size={18} />,
    inherit: "Inherits from Admin, excluding billing and member permissions.",
  },
  {
    id: "__readonly__",
    name: "ReadOnly",
    description: "Can call read-only tools (read_*, list_*, get_*, search_*).",
    server_pattern: "*",
    tool_pattern: "read_*, list_*, get_*, search_*",
    effect: "allow" as const,
    color: "var(--pc-secondary)",
    icon: <Shield size={18} />,
    inherit: "No write or destructive tool access.",
  },
];

const PERMISSION_CATEGORIES = [
  { label: "Servers", patterns: ["*", "github-*", "db-*", "api-*"] },
  { label: "Tools", patterns: ["*", "read_*", "write_*", "delete_*", "search_*", "list_*", "create_*"] },
  { label: "Policies", patterns: ["policy_*", "list_policies", "get_policy"] },
  { label: "Logs", patterns: ["audit_*", "list_logs", "get_logs"] },
  { label: "Keys", patterns: ["key_*", "list_keys", "create_key"] },
  { label: "Billing", patterns: ["billing_*", "get_usage"] },
  { label: "Members", patterns: ["member_*", "invite_*", "list_members"] },
  { label: "Settings", patterns: ["settings_*", "update_config"] },
  { label: "Security", patterns: ["security_*", "audit_*"] },
  { label: "Integrations", patterns: ["integration_*", "connect_*"] },
];

/* ── local permission state ──────────────────────────────────────────────── */

// Since there's no list-permissions endpoint, we track locally created permissions.
type LocalPerm = ToolPermissionView & { _local: true };
type LocalBinding = { roleId: string; keyId: string; keyName: string };

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── sub-components ──────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 8, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EffectBadge({ effect }: { effect: string }) {
  const isAllow = effect === "allow";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: isAllow ? "#35C88A22" : "#F05D5E22",
      color: isAllow ? "var(--pc-success)" : "var(--pc-critical)",
      border: `1px solid ${isAllow ? "#35C88A44" : "#F05D5E44"}`,
    }}>{isAllow ? "Allow" : "Deny"}</span>
  );
}

function PatternBadge({ label }: { label: string }) {
  return (
    <code style={{
      fontSize: 11, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4,
      background: "#48B8E818", color: "var(--pc-secondary)",
      border: "1px solid #48B8E830",
    }}>{label}</code>
  );
}

/* ── add permission dialog ───────────────────────────────────────────────── */

function AddPermissionDialog({
  roleId,
  roleName,
  open,
  onClose,
  onCreated,
}: {
  roleId: string;
  roleName: string;
  open: boolean;
  onClose: () => void;
  onCreated: (perm: LocalPerm) => void;
}) {
  const [serverPattern, setServerPattern] = useState("*");
  const [toolPattern, setToolPattern] = useState("*");
  const [effect, setEffect] = useState<PermissionEffect>(PermissionEffect.allow);
  const [priority, setPriority] = useState("50");
  const [activeCategory, setActiveCategory] = useState("Servers");

  const createPermission = useCreatePermissionV1RolesRoleIdPermissionsPost();

  const inputStyle: React.CSSProperties = {
    background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 6,
    padding: "7px 10px", fontSize: 13, color: "var(--pc-foreground)", width: "100%", outline: "none",
  };

  async function handleCreate() {
    try {
      const result = await createPermission.mutateAsync({
        roleId,
        data: { server_pattern: serverPattern, tool_pattern: toolPattern, effect, priority: parseInt(priority, 10) || 50 },
      });
      const created = result?.data as ToolPermissionView;
      onCreated({ ...created, _local: true });
      toast.success("Permission added");
      onClose();
    } catch {
      toast.error("Failed to add permission");
    }
  }

  const activePatterns = PERMISSION_CATEGORIES.find(c => c.label === activeCategory)?.patterns ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--pc-foreground)", fontSize: 15 }}>
            Add Permission — {roleName}
          </DialogTitle>
        </DialogHeader>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
            Category
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PERMISSION_CATEGORIES.map(c => (
              <button key={c.label} onClick={() => setActiveCategory(c.label)} style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 12,
                border: `1px solid ${activeCategory === c.label ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: activeCategory === c.label ? "#2DD4A718" : "var(--pc-elevated)",
                color: activeCategory === c.label ? "var(--pc-primary)" : "var(--pc-muted)",
                cursor: "pointer", fontWeight: activeCategory === c.label ? 600 : 400,
              }}>{c.label}</button>
            ))}
          </div>
        </div>

        {/* Server Pattern */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
            Server Pattern
          </div>
          <input style={inputStyle} value={serverPattern} onChange={e => setServerPattern(e.target.value)} placeholder="* or github-mcp" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {["*", "github-*", "db-*", "api-*"].map(p => (
              <button key={p} onClick={() => setServerPattern(p)} style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "monospace",
                border: "1px solid var(--pc-border)", background: serverPattern === p ? "#2DD4A718" : "var(--pc-elevated)",
                color: serverPattern === p ? "var(--pc-primary)" : "var(--pc-muted)", cursor: "pointer",
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Tool Pattern */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
            Tool Pattern
          </div>
          <input style={inputStyle} value={toolPattern} onChange={e => setToolPattern(e.target.value)} placeholder="* or read_*" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {activePatterns.map(p => (
              <button key={p} onClick={() => setToolPattern(p)} style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "monospace",
                border: "1px solid var(--pc-border)", background: toolPattern === p ? "#48B8E818" : "var(--pc-elevated)",
                color: toolPattern === p ? "var(--pc-secondary)" : "var(--pc-muted)", cursor: "pointer",
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Effect + Priority */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>Effect</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["allow", "deny"] as PermissionEffect[]).map(e => (
                <button key={e} onClick={() => setEffect(e)} style={{
                  flex: 1, padding: "7px 10px", borderRadius: 6, fontSize: 13, fontWeight: effect === e ? 600 : 400,
                  border: `1px solid ${effect === e ? (e === "allow" ? "var(--pc-success)" : "var(--pc-critical)") : "var(--pc-border)"}`,
                  background: effect === e ? (e === "allow" ? "#35C88A18" : "#F05D5E18") : "var(--pc-elevated)",
                  color: effect === e ? (e === "allow" ? "var(--pc-success)" : "var(--pc-critical)") : "var(--pc-muted)",
                  cursor: "pointer", textTransform: "capitalize",
                }}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>Priority</div>
            <input style={inputStyle} type="number" value={priority} onChange={e => setPriority(e.target.value)} min="1" max="999" />
          </div>
        </div>

        <DialogFooter>
          <button onClick={onClose} style={{ padding: "7px 14px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={createPermission.isPending} style={{
            padding: "7px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6,
            fontSize: 12, fontWeight: 600, color: "#0C1116", cursor: "pointer", opacity: createPermission.isPending ? 0.6 : 1,
          }}>
            {createPermission.isPending ? "Adding…" : "Add Permission"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── assign member dialog ────────────────────────────────────────────────── */

function AssignMemberDialog({
  roleId,
  roleName,
  open,
  onClose,
  onAssigned,
  keys,
}: {
  roleId: string;
  roleName: string;
  open: boolean;
  onClose: () => void;
  onAssigned: (binding: LocalBinding) => void;
  keys: ApiKeyView[];
}) {
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const createBinding = useCreateBindingV1RolesRoleIdBindingsPost();

  async function handleAssign() {
    const key = keys.find(k => k.id === selectedKeyId);
    if (!key) return;
    try {
      await createBinding.mutateAsync({ roleId, data: { subject_id: selectedKeyId, subject_type: SubjectType.api_key } });
      onAssigned({ roleId, keyId: selectedKeyId, keyName: key.name });
      toast.success(`"${key.name}" assigned to ${roleName}`);
      onClose();
    } catch {
      toast.error("Failed to assign member");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", maxWidth: 400 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--pc-foreground)", fontSize: 15 }}>
            Assign Member — {roleName}
          </DialogTitle>
        </DialogHeader>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
            API Key / Member
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {keys.map(k => (
              <button key={k.id} onClick={() => setSelectedKeyId(k.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                border: `1px solid ${selectedKeyId === k.id ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: selectedKeyId === k.id ? "#2DD4A718" : "var(--pc-elevated)",
                borderRadius: 6, cursor: "pointer", textAlign: "left",
              }}>
                <Key size={13} style={{ color: selectedKeyId === k.id ? "var(--pc-primary)" : "var(--pc-muted)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--pc-foreground)", fontWeight: selectedKeyId === k.id ? 600 : 400 }}>{k.name}</div>
                  <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-muted)" }}>{k.key_prefix}…</div>
                </div>
                {selectedKeyId === k.id && <Check size={13} style={{ color: "var(--pc-primary)" }} />}
              </button>
            ))}
            {keys.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: "var(--pc-muted)", fontSize: 13 }}>No API keys found. Create one first.</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button onClick={onClose} style={{ padding: "7px 14px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleAssign} disabled={!selectedKeyId || createBinding.isPending} style={{
            padding: "7px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6,
            fontSize: 12, fontWeight: 600, color: "#0C1116", cursor: "pointer",
            opacity: !selectedKeyId || createBinding.isPending ? 0.5 : 1,
          }}>
            {createBinding.isPending ? "Assigning…" : "Assign"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── custom role row ─────────────────────────────────────────────────────── */

function CustomRoleRow({
  role,
  keys,
  auditRoleIds,
}: {
  role: RoleView;
  keys: ApiKeyView[];
  auditRoleIds: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localPerms, setLocalPerms] = useState<LocalPerm[]>([]);
  const [localBindings, setLocalBindings] = useState<LocalBinding[]>([]);
  const [addPermOpen, setAddPermOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const deletePermission = useDeletePermissionV1RolesRoleIdPermissionsPermissionIdDelete();

  async function removePerm(permId: string) {
    try {
      await deletePermission.mutateAsync({ roleId: role.id, permissionId: permId });
      setLocalPerms(p => p.filter(x => x.id !== permId));
      toast.success("Permission removed");
    } catch {
      toast.error("Failed to remove permission");
    }
  }

  return (
    <>
      <div
        style={{
          background: "var(--pc-elevated)",
          border: "1px solid var(--pc-border)",
          borderRadius: 8,
          marginBottom: 8,
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
          onClick={() => setExpanded(v => !v)}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#2DD4A718", border: "1px solid #2DD4A730", flexShrink: 0,
          }}>
            <Shield size={16} style={{ color: "var(--pc-primary)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--pc-foreground)" }}>{role.name}</div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
              Created {relativeTime(role.created_at)} · {localPerms.length} permissions · {localBindings.length} members
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {auditRoleIds.has(role.id) && (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#35C88A18", color: "var(--pc-success)", border: "1px solid #35C88A30" }}>
                Active
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); setAddPermOpen(true); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 5, fontSize: 11, color: "var(--pc-muted)", cursor: "pointer" }}
            >
              <Plus size={11} /> Permission
            </button>
            <button
              onClick={e => { e.stopPropagation(); setAssignOpen(true); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 5, fontSize: 11, color: "var(--pc-muted)", cursor: "pointer" }}
            >
              <UserPlus size={11} /> Member
            </button>
            {expanded ? <ChevronDown size={14} style={{ color: "var(--pc-muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--pc-muted)" }} />}
          </div>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div style={{ borderTop: "1px solid var(--pc-border)", padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Permissions */}
              <div>
                <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 10 }}>
                  Tool Permissions ({localPerms.length})
                </div>
                {localPerms.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--pc-muted)", padding: "12px 0" }}>
                    No permissions added yet.{" "}
                    <button onClick={() => setAddPermOpen(true)} style={{ color: "var(--pc-primary)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
                      Add one →
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {localPerms.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
                        <Wrench size={11} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                        <div style={{ flex: 1, display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <PatternBadge label={p.server_pattern} />
                          <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>→</span>
                          <PatternBadge label={p.tool_pattern} />
                        </div>
                        <EffectBadge effect={p.effect} />
                        <button onClick={() => removePerm(p.id)} style={{ padding: 3, background: "transparent", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Members */}
              <div>
                <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 10 }}>
                  Assigned Members ({localBindings.length})
                </div>
                {localBindings.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--pc-muted)", padding: "12px 0" }}>
                    No members assigned yet.{" "}
                    <button onClick={() => setAssignOpen(true)} style={{ color: "var(--pc-primary)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
                      Assign one →
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {localBindings.map(b => (
                      <div key={b.keyId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
                        <Key size={11} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--pc-foreground)" }}>{b.keyName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AddPermissionDialog
        roleId={role.id} roleName={role.name}
        open={addPermOpen} onClose={() => setAddPermOpen(false)}
        onCreated={p => setLocalPerms(prev => [...prev, p])}
      />
      <AssignMemberDialog
        roleId={role.id} roleName={role.name}
        open={assignOpen} onClose={() => setAssignOpen(false)}
        onAssigned={b => setLocalBindings(prev => [...prev, b])}
        keys={keys}
      />
    </>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function RolesPage() {
  const qc = useQueryClient();
  const rolesQuery = useListRolesV1RolesGet();
  const keysQuery = useListApiKeysV1ApiKeysGet();
  const auditQuery = useListAuditLogsV1AuditGet({ limit: 200 });

  const roles = useMemo(() => (rolesQuery.data?.data ?? []) as RoleView[], [rolesQuery.data]);
  const keys = useMemo(() => (keysQuery.data?.data ?? []) as ApiKeyView[], [keysQuery.data]);
  const auditLogs = useMemo(() => (auditQuery.data?.data ?? []) as Array<{ subject_id: string | null }>, [auditQuery.data]);

  // Derive active subject IDs from recent audit logs
  const activeSubjectIds = useMemo(() => new Set(auditLogs.map(l => l.subject_id).filter(Boolean) as string[]), [auditLogs]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const createRole = useCreateRoleV1RolesPost();

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      await createRole.mutateAsync({ data: { name: newRoleName.trim() } });
      toast.success(`Role "${newRoleName}" created`);
      qc.invalidateQueries({ queryKey: ["/v1/roles"] });
      setCreateOpen(false);
      setNewRoleName("");
    } catch {
      toast.error("Failed to create role");
    }
  }

  const isLoading = rolesQuery.isLoading;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)", margin: 0, marginBottom: 4 }}>
            Roles &amp; Permissions
          </h1>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>
            Control which subjects can call which tools on which servers.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => qc.invalidateQueries()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#0C1116", cursor: "pointer" }}
          >
            <Plus size={14} /> Create Role
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 28 }}>
        <StatCard label="Total Roles" value={BUILTIN_ROLES.length + roles.length} sub={`${BUILTIN_ROLES.length} built-in`} />
        <StatCard label="Custom Roles" value={roles.length} />
        <StatCard label="Active Subjects" value={activeSubjectIds.size} sub="seen in audit log" />
        <StatCard label="API Keys" value={keys.length} sub="assignable members" />
      </div>

      {/* Built-in roles */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={13} /> Built-in Roles
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {BUILTIN_ROLES.map(role => (
            <div key={role.id} style={{ background: "var(--pc-elevated)", border: `1px solid ${role.color}44`, borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${role.color}18`, color: role.color }}>
                  {role.icon}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-foreground)" }}>{role.name}</div>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${role.color}18`, color: role.color, fontWeight: 600 }}>System</span>
                </div>
                <Star size={12} style={{ color: role.color, marginLeft: "auto" }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 12, lineHeight: 1.5 }}>{role.description}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Server size={11} style={{ color: "var(--pc-muted)" }} />
                  <PatternBadge label={role.server_pattern} />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Wrench size={11} style={{ color: "var(--pc-muted)" }} />
                  <PatternBadge label={role.tool_pattern} />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <EffectBadge effect={role.effect} />
                </div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--pc-border)", fontSize: 11, color: "var(--pc-muted)", lineHeight: 1.4 }}>
                {role.inherit}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Permission matrix info */}
      <div style={{ padding: 14, background: "#48B8E810", border: "1px solid #48B8E830", borderRadius: 8, marginBottom: 24, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Layers size={14} style={{ color: "var(--pc-secondary)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--pc-secondary)" }}>Permission evaluation order:</strong> Deny rules take precedence over Allow rules at the same priority.
          Lower priority number = evaluated first. Built-in roles are always evaluated last as defaults.
        </p>
      </div>

      {/* Custom roles */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={13} /> Custom Roles ({roles.length})
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(3)].map((_, i) => <Skeleton key={i} style={{ height: 64, borderRadius: 8 }} />)}
          </div>
        ) : roles.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10 }}>
            <ShieldAlert size={36} style={{ color: "var(--pc-muted)", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 6 }}>No custom roles yet</div>
            <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 16 }}>Create a role to define fine-grained tool access for specific subjects.</p>
            <button onClick={() => setCreateOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#0C1116", cursor: "pointer" }}>
              <Plus size={13} /> Create Role
            </button>
          </div>
        ) : (
          <div>
            {roles.map(role => (
              <CustomRoleRow key={role.id} role={role} keys={keys} auditRoleIds={activeSubjectIds} />
            ))}
          </div>
        )}
      </div>

      {/* Create role dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", maxWidth: 400 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--pc-foreground)", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: "#2DD4A718", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={15} style={{ color: "var(--pc-primary)" }} />
              </div>
              Create Custom Role
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRole}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
                Role Name <span style={{ color: "var(--pc-critical)" }}>*</span>
              </div>
              <input
                style={{ background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--pc-foreground)", width: "100%", outline: "none" }}
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                placeholder="e.g. Backend Developer, Data Analyst"
                autoFocus
                required
              />
              <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 5 }}>
                After creating, expand the role to add tool permissions and assign members.
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setCreateOpen(false)} style={{ padding: "7px 14px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="submit" disabled={createRole.isPending || !newRoleName.trim()} style={{ padding: "7px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#0C1116", cursor: "pointer", opacity: createRole.isPending || !newRoleName.trim() ? 0.5 : 1 }}>
                {createRole.isPending ? "Creating…" : "Create Role"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
