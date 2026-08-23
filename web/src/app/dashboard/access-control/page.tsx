"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Users,
  FolderKanban,
  ShieldCheck,
  KeyRound,
  Sparkles,
} from "lucide-react";
import MembersTab from "./members-tab";
import TeamsTab from "./teams-tab";
import RolesTab from "./roles-tab";

type TabKey = "members" | "teams" | "roles";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "members", label: "Members", icon: Users },
  { key: "teams",   label: "Teams",   icon: FolderKanban },
  { key: "roles",   label: "Roles & Permissions", icon: ShieldCheck },
];

function AccessControlContent() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") as TabKey | null;
  const current: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "members";

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(45,212,167,0.12)" }}
          >
            <KeyRound className="w-5 h-5" strokeWidth={1.75} style={{ color: "var(--pc-primary)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>
              Access Control
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
              Manage who can reach your gateway — members, teams, and role permissions
            </p>
          </div>
        </div>
        <div
          className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ background: "rgba(45,212,167,0.08)", color: "var(--pc-primary)", border: "1px solid rgba(45,212,167,0.2)" }}
        >
          <Sparkles className="w-3 h-3" strokeWidth={2} />
          Role-based access
        </div>
      </div>

      {/* ── tab bar ── */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl border"
        style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = current === key;
          const href = `/dashboard/access-control${key === "members" ? "" : `?tab=${key}`}`;
          return (
            <Link
              key={key}
              href={href}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={active
                ? { background: "rgba(45,212,167,0.12)", color: "var(--pc-primary)" }
                : { color: "var(--pc-muted)" }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={active ? 2 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* ── tab content ── */}
      {current === "members" && <MembersTab />}
      {current === "teams" && <TeamsTab />}
      {current === "roles" && <RolesTab />}
    </div>
  );
}

export default function AccessControlPage() {
  return (
    <Suspense fallback={null}>
      <AccessControlContent />
    </Suspense>
  );
}
