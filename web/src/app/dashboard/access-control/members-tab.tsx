"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  KeyRound,
  Crown,
  Building2,
  Pencil,
  UserCog,
  Ticket,
} from "lucide-react";
import {
  listMembers,
  createMember,
  updateMember,
  deleteMember,
  listTeams,
  ROLE_ORDER,
  ROLE_META,
  type OrgMemberView,
  type OrgMemberRole,
  type TeamView,
} from "@/lib/admin-rbac";
import { orgGetLicenseV1LicenseGet, type LicenseUsageView } from "@/api/generated";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RelativeTime } from "@/components/relative-time";

/* ── helpers ───────────────────────────────────────────────────────────── */

function RoleBadge({ role }: { role: OrgMemberRole }) {
  const meta = ROLE_META[role];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}40` }}
    >
      {role === "org_owner" && <Crown className="w-3 h-3" strokeWidth={2.5} />}
      {meta.label}
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

/* ── invite member dialog ──────────────────────────────────────────────── */

function InviteMemberDialog({
  open,
  onClose,
  teams,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  teams: TeamView[];
  onCreated: () => void;
}) {
  const [userSubject, setUserSubject] = useState("");
  const [role, setRole] = useState<OrgMemberRole>("developer");
  const [teamId, setTeamId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userSubject.trim() || busy) return;
    setBusy(true);
    try {
      await createMember({
        user_subject: userSubject.trim(),
        admin_role: role,
        team_id: teamId || null,
      });
      toast.success(`Member "${userSubject.trim()}" added`);
      onCreated();
      onClose();
      setUserSubject("");
      setRole("developer");
      setTeamId("");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to add member"
      );
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--pc-foreground)",
    outline: "none",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
            Add Member
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--pc-muted)" }}
            >
              User Subject
            </label>
            <input
              value={userSubject}
              onChange={(e) => setUserSubject(e.target.value)}
              placeholder="OAuth sub claim, e.g. auth0|abc123 or user id"
              required
              style={inputStyle}
              autoFocus
            />
            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
              The stable identity of the dashboard user (not an API key).
            </span>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--pc-muted)" }}
            >
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgMemberRole)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label} — {ROLE_META[r].description}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--pc-muted)" }}
            >
              Team (optional)
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">No team — org-wide role</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Scoping to a team limits the member&apos;s reach to that team&apos;s servers.
            </span>
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
              type="submit"
              disabled={!userSubject.trim() || busy}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {busy ? "Adding…" : "Add Member"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── edit member dialog ────────────────────────────────────────────────── */

function EditMemberDialog({
  open,
  onClose,
  member,
  teams,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  member: OrgMemberView | null;
  teams: TeamView[];
  onChanged: () => void;
}) {
  const [role, setRole] = useState<OrgMemberRole>(member?.admin_role ?? "developer");
  const [teamId, setTeamId] = useState<string>(member?.team_id ?? "");
  const [busy, setBusy] = useState(false);

  if (!member) return null;
  const currentMember = member;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await updateMember(currentMember.id, {
        admin_role: role,
        team_id: teamId || null,
      });
      toast.success(`Member updated`);
      onChanged();
      onClose();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to update member"
      );
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--pc-foreground)",
    outline: "none",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
              style={{ background: "rgba(72,184,232,0.15)" }}
            >
              <Pencil className="w-4 h-4" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
            </div>
            Edit Member
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex items-center gap-2.5 p-3 rounded-xl"
          style={{ background: "var(--pc-elevated)", border: "1px solid var(--pc-border)" }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(45,212,167,0.15)" }}
          >
            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--pc-foreground)" }}>
              {member.user_subject}
            </div>
            <code className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
              {member.id}
            </code>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--pc-muted)" }}
            >
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgMemberRole)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label} — {ROLE_META[r].description}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--pc-muted)" }}
            >
              Team
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">No team — org-wide role</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
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
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {busy ? "Saving…" : "Save Changes"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── main tab ──────────────────────────────────────────────────────────── */

export default function MembersTab() {
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgMemberView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgMemberView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const membersQuery = useQuery({
    queryKey: ["/auth/members", "/auth/teams", "members"],
    queryFn: async () => {
      const [memberList, teamList] = await Promise.all([listMembers(), listTeams()]);
      return { members: memberList, teams: teamList };
    },
  });
  const members = membersQuery.data?.members ?? null;
  const teams = membersQuery.data?.teams ?? [];
  const loading = membersQuery.isLoading;

  const licenseQuery = useQuery({
    queryKey: ["/v1/license", "license"],
    queryFn: () => orgGetLicenseV1LicenseGet(),
    retry: false,
  });
  const license = licenseQuery.data?.data as LicenseUsageView | null ?? null;

  const teamNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const team of teams) map[team.id] = team.name;
    return map;
  }, [teams]);

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.user_subject.toLowerCase().includes(q) ||
        m.admin_role.toLowerCase().includes(q) ||
        (m.team_id && (teamNameById[m.team_id] ?? "").toLowerCase().includes(q))
    );
  }, [members, search, teamNameById]);

  const stats = useMemo(() => {
    if (!members) return { total: 0, owners: 0, admins: 0, teamScoped: 0 };
    return {
      total: members.length,
      owners: members.filter((m) => m.admin_role === "org_owner").length,
      admins: members.filter(
        (m) => m.admin_role === "org_admin" || m.admin_role === "developer"
      ).length,
      teamScoped: members.filter((m) => m.team_id).length,
    };
  }, [members]);

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteMember(deleteTarget.id);
      toast.success(`Member removed`);
      setDeleteTarget(null);
      void membersQuery.refetch();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to remove member"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── toolbar ── */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => void membersQuery.refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors hover:opacity-80"
          style={{ color: "var(--pc-muted)", borderColor: "var(--pc-border)", background: "var(--pc-surface)" }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Member
        </button>
      </div>

      {/* ── stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Total Members"
          value={stats.total}
          color="var(--pc-secondary)"
        />
        <StatCard
          icon={<Crown className="w-5 h-5" />}
          label="Owners"
          value={stats.owners}
          color="#F4B942"
        />
        <StatCard
          icon={<ShieldCheck className="w-5 h-5" />}
          label="Admins & Developers"
          value={stats.admins}
          color="var(--pc-primary)"
        />
        <StatCard
          icon={<UserCog className="w-5 h-5" />}
          label="Team-Scoped"
          value={stats.teamScoped}
          color="#A78BFA"
        />
        {license && (
          <StatCard
            icon={<Ticket className="w-5 h-5" />}
            label={
              license.seat_limit > 0
                ? `Seats Used · ${license.seat_limit} limit`
                : "Seats Used"
            }
            value={
              license.seat_limit > 0
                ? `${stats.total} / ${license.seat_limit}`
                : stats.total
            }
            color={
              license.seat_limit > 0 && stats.total > license.seat_limit
                ? "var(--pc-critical)"
                : "var(--pc-primary)"
            }
          />
        )}
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
          placeholder="Search by subject, role, or team…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--pc-foreground)" }}
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Clear
          </button>
        )}
      </div>

      {/* ── table ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !members || members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--pc-elevated)" }}
            >
              <Users className="w-5 h-5" strokeWidth={1.5} style={{ color: "var(--pc-muted)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              No members yet
            </p>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--pc-muted)" }}>
              Add a dashboard user with an administrative role to get started
            </p>
            <button
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Add Member
            </button>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--pc-muted)" }}>
            No members match &quot;{search}&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
                <tr>
                  {["Subject", "Role", "Team", "Added", "Actions"].map((h, i) => (
                    <th
                      key={h}
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
                {filteredMembers.map((member) => (
                  <tr
                    key={member.id}
                    className="transition-colors hover:brightness-110"
                    style={{ borderBottom: "1px solid var(--pc-border)" }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(45,212,167,0.12)" }}
                        >
                          <KeyRound
                            className="w-3.5 h-3.5"
                            strokeWidth={1.75}
                            style={{ color: "var(--pc-primary)" }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div
                            className="text-sm font-medium truncate max-w-[220px]"
                            style={{ color: "var(--pc-foreground)" }}
                          >
                            {member.user_subject}
                          </div>
                          <code className="text-[11px] font-mono" style={{ color: "var(--pc-muted)" }}>
                            {member.id.slice(0, 8)}…
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <RoleBadge role={member.admin_role} />
                    </td>
                    <td className="px-5 py-3.5">
                      {member.team_id ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{ background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
                        >
                          <Building2 className="w-3 h-3" strokeWidth={2} />
                          {teamNameById[member.team_id] ?? "Unknown team"}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
                          Org-wide
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                        <RelativeTime iso={member.created_at} />
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditTarget(member)}
                          className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                          style={{ color: "var(--pc-muted)", background: "var(--pc-elevated)" }}
                          title="Edit role / team"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(member)}
                          className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                          style={{ color: "var(--pc-critical)", background: "rgba(240,93,94,0.1)" }}
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        teams={teams}
        onCreated={() => void membersQuery.refetch()}
      />

      <EditMemberDialog
        key={editTarget?.id ?? "none"}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        member={editTarget}
        teams={teams}
        onChanged={() => void membersQuery.refetch()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Remove member"
        description={`Remove ${deleteTarget?.user_subject ?? "this member"} from the organization.`}
        consequences={[
          "They lose all dashboard access immediately",
          "Their administrative role and team scope are revoked",
        ]}
        typedConfirmation={deleteTarget?.user_subject.toLowerCase().replace(/\s+/g, "-")}
        confirmLabel="Remove member"
        variant="danger"
      />
    </div>
  );
}