"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Server as ServerIcon,
  Trash2,
  RefreshCw,
  Building2,
  CalendarClock,
  Settings2,
  Unplug,
  Layers,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  listTeams,
  createTeam,
  deleteTeam,
  listMembers,
  assignServerToTeam,
  removeServerFromTeam,
  type TeamView,
} from "@/lib/admin-rbac";
import { useListServersV1ServersGet, type ServerView } from "@/api/generated";
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
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/* ── stat card ─────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 10,
        padding: "14px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--pc-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

/* ── create team dialog ────────────────────────────────────────────────── */

function CreateTeamDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createTeam({ name: name.trim() });
      toast.success(`Team "${name.trim()}" created`);
      onCreated();
      onClose();
      setName("");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to create team"
      );
    } finally {
      setBusy(false);
    }
  }

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
              style={{ background: "rgba(45,212,167,0.15)" }}
            >
              <Users className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
            </div>
            Create Team
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 pt-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--pc-muted)" }}
          >
            Team Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="e.g. Backend, Data Science, Platform"
            autoFocus
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--pc-foreground)",
              outline: "none",
            }}
          />
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Teams group members together and can be scoped to specific MCP servers.
          </p>
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
            onClick={handleCreate}
            disabled={!name.trim() || busy}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            {busy ? "Creating…" : "Create Team"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── manage servers dialog ─────────────────────────────────────────────── */

function ManageServersDialog({
  open,
  onClose,
  team,
  servers,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamView | null;
  servers: ServerView[];
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [serverIds, setServerIds] = useState<string[]>(() => team?.server_ids ?? []);

  if (!team) return null;
  const currentTeam = team;

  async function toggle(serverId: string, currentlyAssigned: boolean) {
    setPending((p) => ({ ...p, [serverId]: true }));
    try {
      if (currentlyAssigned) {
        await removeServerFromTeam(currentTeam.id, serverId);
      } else {
        await assignServerToTeam(currentTeam.id, serverId);
      }
      setServerIds((ids) =>
        currentlyAssigned ? ids.filter((id) => id !== serverId) : [...ids, serverId]
      );
      onChanged();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to update server assignment"
      );
    } finally {
      setPending((p) => ({ ...p, [serverId]: false }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg rounded-2xl border"
        style={{
          background: "var(--pc-surface)",
          borderColor: "var(--pc-border)",
          maxHeight: "85vh",
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
              style={{ background: "rgba(72,184,232,0.15)" }}
            >
              <Settings2 className="w-4 h-4" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
            </div>
            Manage Servers — {team.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 pt-1">
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Members of this team can reach only the servers assigned below.
          </p>

          {servers.length === 0 ? (
            <div
              className="text-sm p-4 rounded-xl text-center"
              style={{ color: "var(--pc-muted)", background: "var(--pc-elevated)" }}
            >
              No MCP servers registered yet.{" "}
              <Link
                href="/dashboard/servers"
                style={{ color: "var(--pc-primary)", textDecoration: "none" }}
              >
                Register a server
              </Link>{" "}
              first.
            </div>
          ) : (
            <div className="space-y-1.5">
              {servers.map((server) => {
                const assigned = serverIds.includes(server.id);
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => toggle(server.id, assigned)}
                    disabled={!!pending[server.id]}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-colors disabled:opacity-60"
                    style={{
                      background: assigned ? "rgba(45,212,167,0.12)" : "var(--pc-elevated)",
                      border: `1px solid ${assigned ? "var(--pc-primary)" : "var(--pc-border)"}`,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: assigned
                          ? "rgba(45,212,167,0.2)"
                          : "rgba(72,184,232,0.12)",
                      }}
                    >
                      <ServerIcon
                        className="w-3.5 h-3.5"
                        strokeWidth={1.75}
                        style={{ color: assigned ? "var(--pc-primary)" : "#48B8E8" }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--pc-foreground)" }}
                      >
                        {server.name}
                      </div>
                      <code className="text-xs font-mono" style={{ color: "var(--pc-muted)" }}>
                        {server.slug}
                      </code>
                    </div>
                    {assigned && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "rgba(45,212,167,0.15)", color: "var(--pc-primary)" }}
                      >
                        <Check className="w-3 h-3" strokeWidth={3} />
                        Assigned
                      </span>
                    )}
                    {pending[server.id] && (
                      <span className="text-[11px]" style={{ color: "var(--pc-muted)" }}>
                        …
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: "var(--pc-muted)" }}
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── team card ─────────────────────────────────────────────────────────── */

function TeamCard({
  team,
  memberCount,
  servers,
  onManageServers,
  onDelete,
}: {
  team: TeamView;
  memberCount: number;
  servers: ServerView[];
  onManageServers: (team: TeamView) => void;
  onDelete: (team: TeamView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = teamColor(team.name);
  const initials = teamInitials(team.name);
  const assignedServers = servers.filter((s) => team.server_ids.includes(s.id));

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `${color}22`,
              border: `2px solid ${color}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              color,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{ fontSize: 15, fontWeight: 700, color: "var(--pc-foreground)", marginBottom: 3 }}
            >
              {team.name}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--pc-muted)", display: "flex", alignItems: "center", gap: 4 }}
            >
              <CalendarClock size={11} />
              Created <RelativeTime iso={team.created_at} />
            </div>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { icon: <Users size={13} />, label: "Members", value: memberCount },
            {
              icon: <ServerIcon size={13} />,
              label: "Servers",
              value: team.server_ids.length,
            },
            {
              icon: <Layers size={13} />,
              label: "Org-wide",
              value: team.server_ids.length === 0 ? "Yes" : "No",
            },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", color: "var(--pc-muted)", marginBottom: 4 }}>
                {item.icon}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-foreground)" }}>
                {item.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--pc-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--pc-border)", padding: "16px 20px" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--pc-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Assigned Servers
          </div>
          {assignedServers.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0 }}>
              No servers assigned — members have org-wide server access.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {assignedServers.map((server) => (
                <span
                  key={server.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: "monospace",
                    background: "#48B8E818",
                    color: "var(--pc-secondary)",
                    border: "1px solid #48B8E830",
                  }}
                >
                  <ServerIcon size={10} />
                  {server.slug}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => onManageServers(team)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--pc-foreground)",
                cursor: "pointer",
              }}
            >
              <Settings2 size={12} />
              Manage Servers
            </button>
            <button
              onClick={() => onDelete(team)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "rgba(240,93,94,0.1)",
                border: "1px solid rgba(240,93,94,0.25)",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--pc-critical)",
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── main tab ──────────────────────────────────────────────────────────── */

export default function TeamsTab() {
  const qc = useQueryClient();
  const { data: serversResp } = useListServersV1ServersGet();

  const [createOpen, setCreateOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<TeamView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const serversQuery = useQuery({
    queryKey: ["/auth/teams", "/auth/members", "teams"],
    queryFn: async () => {
      const [teamList, memberList] = await Promise.all([listTeams(), listMembers()]);
      return { teams: teamList, members: memberList };
    },
  });
  const teams = serversQuery.data?.teams ?? null;
  const members = serversQuery.data?.members ?? [];
  const loading = serversQuery.isLoading;

  const servers = useMemo(
    () => (Array.isArray(serversResp?.data) ? serversResp.data : []) as ServerView[],
    [serversResp]
  );

  const refresh = () => {
    void serversQuery.refetch();
    qc.invalidateQueries({ queryKey: ["/v1/servers"] });
  };

  const memberCountByTeam = useMemo(() => {
    const map: Record<string, number> = {};
    for (const member of members) {
      if (member.team_id) map[member.team_id] = (map[member.team_id] ?? 0) + 1;
    }
    return map;
  }, [members]);

  const unassignedMembers = useMemo(
    () => members.filter((m) => !m.team_id).length,
    [members]
  );

  const assignedServerCount = useMemo(
    () => teams?.reduce((sum, team) => sum + team.server_ids.length, 0) ?? 0,
    [teams]
  );

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteTeam(deleteTarget.id);
      toast.success(`Team "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      void serversQuery.refetch();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to delete team"
      );
    } finally {
      setDeleting(false);
    }
  }

  const allMembersCount = members.length;

  return (
    <div className="space-y-6">
      {/* ── toolbar ── */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors hover:opacity-80"
          style={{ color: "var(--pc-muted)", borderColor: "var(--pc-border)", background: "var(--pc-surface)" }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Create Team
        </button>
      </div>

      {/* ── stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Teams" value={teams?.length ?? 0} />
        <StatCard label="Total Members" value={allMembersCount} sub={`${unassignedMembers} org-wide`} />
        <StatCard label="Server Assignments" value={assignedServerCount} />
        <StatCard
          label="With Servers"
          value={teams?.filter((t) => t.server_ids.length > 0).length ?? 0}
        />
      </div>

      {/* ── info banner ── */}
      <div
        style={{
          padding: 12,
          background: "#48B8E810",
          border: "1px solid #48B8E830",
          borderRadius: 8,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <Unplug size={14} style={{ color: "var(--pc-secondary)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--pc-muted)", margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--pc-secondary)" }}>Team-scoped access.</strong> Assigning
          servers to a team restricts that team&apos;s members to those servers only. A team with no
          servers grants org-wide access. Member management happens on the{" "}
          <Link href="/dashboard/access-control?tab=members" style={{ color: "var(--pc-primary)", textDecoration: "none" }}>
            Members
          </Link>{" "}
          tab.
        </p>
      </div>

      {/* ── teams grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} style={{ height: 180, borderRadius: 10 }} />
          ))}
        </div>
      ) : !teams || teams.length === 0 ? (
        <div
          style={{
            padding: 56,
            textAlign: "center",
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 12,
          }}
        >
          <Building2 size={44} style={{ color: "var(--pc-muted)", marginBottom: 14, margin: "0 auto 14px" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 6 }}>
            No teams yet
          </div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", maxWidth: 360, margin: "0 auto 20px" }}>
            Teams group members together and scope their server access. Create your first team to get
            started.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "var(--pc-primary)",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#0C1116",
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Create First Team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              memberCount={memberCountByTeam[team.id] ?? 0}
              servers={servers}
              onManageServers={setManageTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <CreateTeamDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />

      <ManageServersDialog
        key={manageTarget?.id ?? "none"}
        open={!!manageTarget}
        onClose={() => setManageTarget(null)}
        team={manageTarget}
        servers={servers}
        onChanged={refresh}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={`Delete ${deleteTarget?.name ?? "team"}`}
        description="This team will be permanently removed."
        consequences={[
          "Members stay in the organization but lose their team scope",
          "Server-to-team assignments are removed",
        ]}
        typedConfirmation={deleteTarget?.name.toLowerCase().replace(/\s+/g, "-")}
        confirmLabel="Delete team"
        variant="danger"
      />
    </div>
  );
}