"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Key,
  Shield,
  Server,
  Wrench,
  Activity,
  Clock,
  UserPlus,
  Building2,
  Star,
  GitBranch,
  RefreshCw,
  Layers,
} from "lucide-react";
import {
  useListRolesV1RolesGet,
  useCreateRoleV1RolesPost,
  useCreateBindingV1RolesRoleIdBindingsPost,
  useCreatePermissionV1RolesRoleIdPermissionsPost,
  useListApiKeysV1ApiKeysGet,
  useListPoliciesV1RateLimitPoliciesGet,
  useListAuditLogsV1AuditGet,
  type RoleView,
  type ApiKeyView,
  type RateLimitPolicyView,
  type AuditLogView,
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

/* ── types ───────────────────────────────────────────────────────────────── */

interface TeamLocal {
  roleId: string;
  roleName: string;
  description: string;
  leadKeyId: string | null;
  memberKeyIds: string[];
  toolPatterns: string[];
  serverPattern: string;
  createdAt: string;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const TEAM_COLORS = [
  "var(--pc-primary)",
  "var(--pc-secondary)",
  "var(--pc-warning)",
  "#A78BFA",
  "#FB7185",
  "#34D399",
];

function teamColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length];
}

function teamInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

/* ── stat card ───────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 8, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── create team dialog ──────────────────────────────────────────────────── */

function CreateTeamDialog({
  open,
  onClose,
  keys,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  keys: ApiKeyView[];
  onCreated: (team: TeamLocal) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverPattern, setServerPattern] = useState("*");
  const [toolPatterns, setToolPatterns] = useState<string[]>(["*"]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [leadId, setLeadId] = useState("");
  const [step, setStep] = useState(0);

  const createRole = useCreateRoleV1RolesPost();
  const createBinding = useCreateBindingV1RolesRoleIdBindingsPost();
  const createPermission = useCreatePermissionV1RolesRoleIdPermissionsPost();

  function toggleTool(pattern: string) {
    setToolPatterns(prev =>
      prev.includes(pattern) ? prev.filter(p => p !== pattern) : [...prev, pattern]
    );
  }

  function toggleMember(id: string) {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      const roleResult = await createRole.mutateAsync({ data: { name: name.trim() } });
      const role = roleResult?.data as RoleView;
      const roleId = role.id;

      // Create permission
      if (toolPatterns.length > 0) {
        for (const tp of toolPatterns) {
          await createPermission.mutateAsync({
            roleId,
            data: { server_pattern: serverPattern, tool_pattern: tp, effect: PermissionEffect.allow, priority: 50 },
          });
        }
      }

      // Assign members
      for (const keyId of selectedMembers) {
        await createBinding.mutateAsync({ roleId, data: { subject_id: keyId, subject_type: SubjectType.api_key } });
      }

      const team: TeamLocal = {
        roleId,
        roleName: name.trim(),
        description: description.trim(),
        leadKeyId: leadId || selectedMembers[0] || null,
        memberKeyIds: selectedMembers,
        toolPatterns,
        serverPattern,
        createdAt: new Date().toISOString(),
      };
      onCreated(team);
      toast.success(`Team "${name}" created`);
      onClose();
      setName(""); setDescription(""); setServerPattern("*"); setToolPatterns(["*"]); setSelectedMembers([]); setLeadId(""); setStep(0);
    } catch {
      toast.error("Failed to create team");
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--pc-bg)", border: "1px solid var(--pc-border)", borderRadius: 6,
    padding: "8px 12px", fontSize: 13, color: "var(--pc-foreground)", width: "100%", outline: "none",
  };

  const isCreating = createRole.isPending || createBinding.isPending || createPermission.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", maxWidth: 500 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--pc-foreground)", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: "#2DD4A718", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={15} style={{ color: "var(--pc-primary)" }} />
            </div>
            Create Team — {step === 0 ? "Details" : step === 1 ? "Access" : "Members"}
          </DialogTitle>
        </DialogHeader>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {["Details", "Access", "Members"].map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, flex: i < 2 ? 1 : undefined }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: i < step ? "var(--pc-primary)" : i === step ? "#2DD4A730" : "var(--pc-elevated)", border: `2px solid ${i <= step ? "var(--pc-primary)" : "var(--pc-border)"}`, color: i < step ? "#0C1116" : i === step ? "var(--pc-primary)" : "var(--pc-muted)" }}>
                  {i < step ? <Check size={11} strokeWidth={3} /> : i + 1}
                </div>
                <span style={{ fontSize: 9, color: i === step ? "var(--pc-primary)" : "var(--pc-muted)" }}>{label}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 2, background: i < step ? "var(--pc-primary)" : "var(--pc-border)", marginBottom: 14 }} />}
            </div>
          ))}
        </div>

        {/* Step 0: Details */}
        {step === 0 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
                Team Name <span style={{ color: "var(--pc-critical)" }}>*</span>
              </div>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Backend Team, Data Science" autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
                Description
              </div>
              <textarea style={{ ...inputStyle, resize: "none", minHeight: 72 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this team do?" />
            </div>
          </div>
        )}

        {/* Step 1: Access */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
                Server Access
              </div>
              <input style={inputStyle} value={serverPattern} onChange={e => setServerPattern(e.target.value)} placeholder="* or github-*" />
              <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                {["*", "github-*", "db-*", "api-*"].map(p => (
                  <button key={p} onClick={() => setServerPattern(p)} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", border: "1px solid var(--pc-border)", background: serverPattern === p ? "#2DD4A718" : "var(--pc-elevated)", color: serverPattern === p ? "var(--pc-primary)" : "var(--pc-muted)", cursor: "pointer" }}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                Allowed Tool Patterns (select all that apply)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {["*", "read_*", "write_*", "list_*", "create_*", "search_*", "delete_*", "get_*"].map(p => {
                  const active = toolPatterns.includes(p);
                  return (
                    <button key={p} onClick={() => toggleTool(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${active ? "var(--pc-secondary)" : "var(--pc-border)"}`, background: active ? "#48B8E818" : "var(--pc-elevated)", color: active ? "var(--pc-secondary)" : "var(--pc-muted)", cursor: "pointer", fontSize: 12, fontFamily: "monospace", fontWeight: active ? 600 : 400 }}>
                      {active && <Check size={11} strokeWidth={3} />}
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Members */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                Add Members (API Keys)
              </div>
              {keys.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: "var(--pc-muted)", fontSize: 12, background: "var(--pc-elevated)", borderRadius: 8, border: "1px solid var(--pc-border)" }}>
                  No API keys found. You can add members after creation.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {keys.map(k => {
                    const selected = selectedMembers.includes(k.id);
                    return (
                      <button key={k.id} onClick={() => toggleMember(k.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${selected ? "var(--pc-primary)" : "var(--pc-border)"}`, background: selected ? "#2DD4A718" : "var(--pc-elevated)", borderRadius: 6, cursor: "pointer", textAlign: "left" }}>
                        <Key size={12} style={{ color: selected ? "var(--pc-primary)" : "var(--pc-muted)", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "var(--pc-foreground)", fontWeight: selected ? 600 : 400 }}>{k.name}</div>
                          <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-muted)" }}>{k.key_prefix}…</div>
                        </div>
                        {selected && <Check size={12} style={{ color: "var(--pc-primary)" }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedMembers.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                  Team Lead
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {selectedMembers.map(id => {
                    const k = keys.find(x => x.id === id);
                    if (!k) return null;
                    return (
                      <button key={id} onClick={() => setLeadId(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${leadId === id ? "var(--pc-warning)" : "var(--pc-border)"}`, background: leadId === id ? "#F4B94218" : "var(--pc-elevated)", borderRadius: 6, cursor: "pointer" }}>
                        <Star size={11} style={{ color: leadId === id ? "var(--pc-warning)" : "var(--pc-muted)" }} />
                        <span style={{ fontSize: 12, color: "var(--pc-foreground)" }}>{k.name}</span>
                        {leadId === id && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--pc-warning)", fontWeight: 600 }}>Lead</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--pc-border)" }}>
          <button onClick={() => step === 0 ? onClose() : setStep(s => s - 1)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "transparent", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            {step === 0 ? <X size={12} /> : <ChevronRight size={12} style={{ transform: "rotate(180deg)" }} />}
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < 2 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !name.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: step === 0 && !name.trim() ? "var(--pc-elevated)" : "var(--pc-primary)", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, color: step === 0 && !name.trim() ? "var(--pc-muted)" : "#0C1116", cursor: step === 0 && !name.trim() ? "not-allowed" : "pointer" }}>
              Continue <ChevronRight size={12} />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={isCreating} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#0C1116", cursor: "pointer", opacity: isCreating ? 0.6 : 1 }}>
              <Users size={12} />
              {isCreating ? "Creating…" : "Create Team"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── team card ───────────────────────────────────────────────────────────── */

function TeamCard({
  team,
  keys,
  policies,
  auditLogs,
}: {
  team: TeamLocal;
  keys: ApiKeyView[];
  policies: RateLimitPolicyView[];
  auditLogs: AuditLogView[];
}) {
  const [expanded, setExpanded] = useState(false);
  const color = teamColor(team.roleName);
  const initials = teamInitials(team.roleName);

  const memberKeys = useMemo(() => keys.filter(k => team.memberKeyIds.includes(k.id)), [keys, team.memberKeyIds]);
  const leadKey = useMemo(() => keys.find(k => k.id === team.leadKeyId), [keys, team.leadKeyId]);

  const linkedPolicies = useMemo(() =>
    policies.filter(p =>
      !team.serverPattern || team.serverPattern === "*" || p.server_pattern === team.serverPattern || p.server_pattern === "*"
    ),
    [policies, team.serverPattern]
  );

  const memberAudit = useMemo(() =>
    auditLogs.filter(l => l.subject_id && team.memberKeyIds.includes(l.subject_id)),
    [auditLogs, team.memberKeyIds]
  );

  const recentActivity = useMemo(() =>
    memberAudit.filter(l => Date.now() - new Date(l.created_at).getTime() < 86_400_000).length,
    [memberAudit]
  );

  return (
    <div style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10, overflow: "hidden" }}>
      {/* Card header */}
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          {/* Avatar */}
          <div style={{ width: 44, height: 44, borderRadius: 10, background: `${color}22`, border: `2px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pc-foreground)", marginBottom: 3 }}>{team.roleName}</div>
            {team.description ? (
              <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0, lineHeight: 1.4 }}>{team.description}</p>
            ) : (
              <p style={{ fontSize: 12, color: "var(--pc-border)", margin: 0, fontStyle: "italic" }}>No description</p>
            )}
          </div>
          <button onClick={() => setExpanded(v => !v)} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[
            { icon: <Users size={13} />, label: "Members", value: memberKeys.length },
            { icon: <Wrench size={13} />, label: "Tool Access", value: team.toolPatterns.join(", ") || "*" },
            { icon: <Shield size={13} />, label: "Policies", value: linkedPolicies.length },
            { icon: <Activity size={13} />, label: "Today", value: recentActivity },
          ].map(item => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", color: "var(--pc-muted)", marginBottom: 4 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Lead */}
        {leadKey && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--pc-border)", display: "flex", alignItems: "center", gap: 8 }}>
            <Star size={11} style={{ color: "var(--pc-warning)" }} />
            <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>Lead:</span>
            <span style={{ fontSize: 11, color: "var(--pc-foreground)", fontWeight: 600 }}>{leadKey.name}</span>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--pc-border)", padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Members list */}
            <div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                Members
              </div>
              {memberKeys.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--pc-muted)" }}>No members yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {memberKeys.map(k => (
                    <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
                      <Key size={11} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "var(--pc-foreground)" }}>{k.name}</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-muted)" }}>{k.key_prefix}…</div>
                      </div>
                      {k.id === team.leadKeyId && <Star size={10} style={{ color: "var(--pc-warning)" }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tool access */}
            <div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                Tool Access
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "var(--pc-muted)", marginBottom: 4 }}>Server</div>
                <code style={{ fontSize: 11, fontFamily: "monospace", padding: "3px 7px", borderRadius: 4, background: "#2DD4A718", color: "var(--pc-primary)", border: "1px solid #2DD4A730" }}>
                  {team.serverPattern || "*"}
                </code>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--pc-muted)", marginBottom: 6 }}>Tools</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(team.toolPatterns.length > 0 ? team.toolPatterns : ["*"]).map(p => (
                    <code key={p} style={{ fontSize: 11, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4, background: "#48B8E818", color: "var(--pc-secondary)", border: "1px solid #48B8E830" }}>{p}</code>
                  ))}
                </div>
              </div>
            </div>

            {/* Linked policies */}
            <div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                Rate Limit Policies
              </div>
              {linkedPolicies.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--pc-muted)" }}>No matching policies.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {linkedPolicies.slice(0, 4).map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
                      <Shield size={11} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "var(--pc-foreground)" }}>{p.request_limit} req / {p.window_seconds}s</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--pc-muted)" }}>{p.tool_pattern ?? "*"}</div>
                      </div>
                    </div>
                  ))}
                  {linkedPolicies.length > 4 && (
                    <div style={{ fontSize: 11, color: "var(--pc-muted)", paddingLeft: 4 }}>+{linkedPolicies.length - 4} more</div>
                  )}
                </div>
              )}
            </div>

            {/* Recent activity */}
            <div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
                Recent Activity
              </div>
              {memberAudit.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--pc-muted)" }}>No recent activity.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {memberAudit.slice(0, 5).map(l => (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--pc-bg)", borderRadius: 6, border: "1px solid var(--pc-border)" }}>
                      <Activity size={10} style={{ color: l.outcome === "allowed" ? "var(--pc-success)" : "var(--pc-critical)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 11, fontFamily: "monospace", color: "var(--pc-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.tool_name ?? l.event_type}</span>
                      <span style={{ fontSize: 10, color: "var(--pc-muted)", whiteSpace: "nowrap" }}>{relativeTime(l.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function TeamsPage() {
  const qc = useQueryClient();
  const rolesQuery = useListRolesV1RolesGet();
  const keysQuery = useListApiKeysV1ApiKeysGet();
  const policiesQuery = useListPoliciesV1RateLimitPoliciesGet();
  const auditQuery = useListAuditLogsV1AuditGet({ limit: 200 });

  const roles = useMemo(() => (rolesQuery.data?.data ?? []) as RoleView[], [rolesQuery.data]);
  const keys = useMemo(() => (keysQuery.data?.data ?? []) as ApiKeyView[], [keysQuery.data]);
  const policies = useMemo(() => (policiesQuery.data?.data ?? []) as RateLimitPolicyView[], [policiesQuery.data]);
  const auditLogs = useMemo(() => (auditQuery.data?.data ?? []) as AuditLogView[], [auditQuery.data]);

  // Teams derived from roles + locally-created teams
  const [localTeams, setLocalTeams] = useState<TeamLocal[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Derive teams from roles (roles without local override are shown as basic teams)
  const roleTeams = useMemo<TeamLocal[]>(() =>
    roles
      .filter(r => !localTeams.some(t => t.roleId === r.id))
      .map(r => ({
        roleId: r.id,
        roleName: r.name,
        description: "",
        leadKeyId: null,
        memberKeyIds: [],
        toolPatterns: ["*"],
        serverPattern: "*",
        createdAt: r.created_at,
      })),
    [roles, localTeams]
  );

  const allTeams = useMemo(() => [...localTeams, ...roleTeams], [localTeams, roleTeams]);

  const recentAudit24h = useMemo(() =>
    auditLogs.filter(l => Date.now() - new Date(l.created_at).getTime() < 86_400_000),
    [auditLogs]
  );

  const activeTeams = useMemo(() =>
    allTeams.filter(t =>
      t.memberKeyIds.some(id => recentAudit24h.some(l => l.subject_id === id))
    ).length,
    [allTeams, recentAudit24h]
  );

  const totalMembers = useMemo(() => {
    const ids = new Set(allTeams.flatMap(t => t.memberKeyIds));
    return ids.size;
  }, [allTeams]);

  const teamsWithPolicies = useMemo(() =>
    allTeams.filter(t => policies.some(p => !t.serverPattern || t.serverPattern === "*" || p.server_pattern === t.serverPattern)).length,
    [allTeams, policies]
  );

  const isLoading = rolesQuery.isLoading;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)", margin: 0, marginBottom: 4 }}>Teams</h1>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>
            Organize API keys into teams with shared tool access and policies. Teams map to roles.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => qc.invalidateQueries()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 6, fontSize: 12, color: "var(--pc-muted)", cursor: "pointer" }}>
            <RefreshCw size={12} />
          </button>
          <button onClick={() => setCreateOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--pc-primary)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#0C1116", cursor: "pointer" }}>
            <Plus size={14} /> Create Team
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 28 }}>
        <StatCard label="Total Teams" value={allTeams.length} sub="from roles" />
        <StatCard label="Total Members" value={totalMembers} sub="unique keys" />
        <StatCard label="Active Today" value={activeTeams} sub="teams with recent calls" />
        <StatCard label="With Policies" value={teamsWithPolicies} sub="rate limit coverage" />
      </div>

      {/* Info banner */}
      <div style={{ padding: 14, background: "#48B8E810", border: "1px solid #48B8E830", borderRadius: 8, marginBottom: 24, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Layers size={14} style={{ color: "var(--pc-secondary)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--pc-secondary)" }}>Teams are backed by roles.</strong> Each team automatically creates a role and assigns tool permissions to it.
          Members (API keys) are bound to the role. Creating a team here also creates a corresponding role in{" "}
          <a href="/dashboard/roles" style={{ color: "var(--pc-primary)", textDecoration: "none" }}>Roles &amp; Permissions</a>.
        </p>
      </div>

      {/* Teams grid */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: 180, borderRadius: 10 }} />)}
        </div>
      ) : allTeams.length === 0 ? (
        <div style={{ padding: 64, textAlign: "center", background: "var(--pc-elevated)", border: "1px solid var(--pc-border)", borderRadius: 10 }}>
          <Building2 size={44} style={{ color: "var(--pc-muted)", marginBottom: 14 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 6 }}>No teams yet</div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
            Teams group API keys together under shared tool access policies. Create your first team to get started.
          </p>
          <button onClick={() => setCreateOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "var(--pc-primary)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#0C1116", cursor: "pointer" }}>
            <Plus size={14} /> Create First Team
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {allTeams.map(team => (
            <TeamCard key={team.roleId} team={team} keys={keys} policies={policies} auditLogs={auditLogs} />
          ))}
        </div>
      )}

      <CreateTeamDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        keys={keys}
        onCreated={team => {
          setLocalTeams(prev => [team, ...prev]);
          qc.invalidateQueries({ queryKey: ["/v1/roles"] });
        }}
      />
    </div>
  );
}
