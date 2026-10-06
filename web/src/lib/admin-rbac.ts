/**
 * Typed client for the administrative RBAC API (teams + org members).
 *
 * These endpoints live under /auth/* and are not part of the orval-generated
 * /v1/* client, so they are typed here and called through the shared axios
 * instance (which injects the Bearer token and handles 401 redirects).
 */
import { axiosClient } from "@/lib/axios-instance";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type OrgMemberRole =
  | "org_owner"
  | "org_admin"
  | "developer"
  | "team_member"
  | "viewer"
  | "auditor"
  | "billing_admin";

export interface TeamView {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  server_ids: string[];
}

export interface TeamCreate {
  name: string;
}

export interface OrgMemberView {
  id: string;
  tenant_id: string;
  user_subject: string;
  admin_role: OrgMemberRole;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMemberCreate {
  user_subject: string;
  admin_role: OrgMemberRole;
  team_id?: string | null;
}

export interface OrgMemberUpdate {
  admin_role?: OrgMemberRole;
  team_id?: string | null;
}

/* ── Role metadata ─────────────────────────────────────────────────────── */

export const ROLE_ORDER: OrgMemberRole[] = [
  "org_owner",
  "org_admin",
  "developer",
  "team_member",
  "viewer",
  "auditor",
  "billing_admin",
];

export const ROLE_META: Record<
  OrgMemberRole,
  { label: string; description: string; color: string }
> = {
  org_owner: {
    label: "Org Owner",
    description: "Full control — billing, deletion, all members and servers",
    color: "#F4B942",
  },
  org_admin: {
    label: "Org Admin",
    description: "Operational control — servers, RBAC, keys, members",
    color: "#2DD4A7",
  },
  developer: {
    label: "Developer",
    description: "Manage servers, tools and rate limits within their team",
    color: "#48B8E8",
  },
  team_member: {
    label: "Team Member",
    description: "Developer-level access without team/member management",
    color: "#A78BFA",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to servers, tools and audit logs",
    color: "#8B98A7",
  },
  auditor: {
    label: "Auditor",
    description: "Org-wide audit + RBAC read access, no changes",
    color: "#2DD4A7",
  },
  billing_admin: {
    label: "Billing Admin",
    description: "Payments, invoices and seats only",
    color: "#F0A35E",
  },
};

/* ── Teams ─────────────────────────────────────────────────────────────── */

export async function listTeams(): Promise<TeamView[]> {
  const { data } = await axiosClient.get<TeamView[]>("/auth/teams");
  return data;
}

export async function createTeam(body: TeamCreate): Promise<TeamView> {
  const { data } = await axiosClient.post<TeamView>("/auth/teams", body);
  return data;
}

export async function updateTeam(
  teamId: string,
  body: { name: string }
): Promise<TeamView> {
  const { data } = await axiosClient.patch<TeamView>(`/auth/teams/${teamId}`, body);
  return data;
}

export async function deleteTeam(teamId: string): Promise<void> {
  await axiosClient.delete(`/auth/teams/${teamId}`);
}

export async function assignServerToTeam(
  teamId: string,
  serverId: string
): Promise<void> {
  await axiosClient.post(`/auth/teams/${teamId}/servers/${serverId}`);
}

export async function removeServerFromTeam(
  teamId: string,
  serverId: string
): Promise<void> {
  await axiosClient.delete(`/auth/teams/${teamId}/servers/${serverId}`);
}

export async function listTeamMembers(teamId: string): Promise<OrgMemberView[]> {
  const { data } = await axiosClient.get<OrgMemberView[]>(
    `/auth/teams/${teamId}/members`
  );
  return data;
}

/* ── Org members ───────────────────────────────────────────────────────── */

export async function listMembers(): Promise<OrgMemberView[]> {
  const { data } = await axiosClient.get<OrgMemberView[]>("/auth/members");
  return data;
}

export async function createMember(body: OrgMemberCreate): Promise<OrgMemberView> {
  const { data } = await axiosClient.post<OrgMemberView>("/auth/members", body);
  return data;
}

export async function updateMember(
  memberId: string,
  body: OrgMemberUpdate
): Promise<OrgMemberView> {
  const { data } = await axiosClient.patch<OrgMemberView>(
    `/auth/members/${memberId}`,
    body
  );
  return data;
}

export async function deleteMember(memberId: string): Promise<void> {
  await axiosClient.delete(`/auth/members/${memberId}`);
}