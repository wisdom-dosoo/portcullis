"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Toaster } from "@/components/ui/sonner";
import { isAuthenticated, clearToken } from "@/lib/auth";
import { useListRolesV1RolesGet, type RoleView } from "@/api/generated";
import { cn } from "@/lib/utils";
import {
  Shield,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Search,
  Command,
  ChevronDown,
  LayoutDashboard,
  Server,
  Users,
  Crown,
  Code2,
  CheckCheck,
} from "lucide-react";
import { CommandPalette } from "./command-palette";
import { NotificationBell, NotificationPanel, DEMO_NOTIFICATIONS } from "./notification-panel";

/* ── Types ───────────────────────────────────────────────────────── */

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export type NavContext = "org-admin" | "platform-admin" | "developer";

interface NavShellProps {
  context: NavContext;
  sections: NavSection[];
  children: React.ReactNode;
}

/* ── Context definitions ─────────────────────────────────────────── */

const CONTEXT_META: Record<NavContext, { label: string; sublabel: string; icon: React.ElementType; color: string; bg: string }> = {
  "org-admin": {
    label: "Org Admin",
    sublabel: "Organization",
    icon: LayoutDashboard,
    color: "#2DD4A7",
    bg: "rgba(45,212,167,0.15)",
  },
  "platform-admin": {
    label: "Platform Admin",
    sublabel: "Super Admin",
    icon: Crown,
    color: "#F4B942",
    bg: "rgba(244,185,66,0.15)",
  },
  "developer": {
    label: "Developer",
    sublabel: "Workspace",
    icon: Code2,
    color: "#48B8E8",
    bg: "rgba(72,184,232,0.15)",
  },
};

const CONTEXT_ROOTS: Record<NavContext, string> = {
  "org-admin": "/dashboard",
  "platform-admin": "/admin",
  "developer": "/developer",
};

/* ── Role → context mapping ──────────────────────────────────────── */

const ROLE_TO_CONTEXT: Record<string, NavContext> = {
  "platform super admin": "platform-admin",
  "super-admin": "platform-admin",
  "organization owner": "org-admin",
  "org-owner": "org-admin",
  "organization admin": "org-admin",
  "org-admin": "org-admin",
  "developer": "developer",
  "security auditor": "org-admin",
  "billing manager": "org-admin",
};

function roleToContext(roleName: string): NavContext {
  return ROLE_TO_CONTEXT[roleName.toLowerCase()] ?? "org-admin";
}

/* ── Context switcher dropdown ───────────────────────────────────── */

function ContextSwitcher({ current, roles }: { current: NavContext; roles: RoleView[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const meta = CONTEXT_META[current];
  const Icon = meta.icon;

  // Derive available contexts from backend roles; always include current
  const availableContexts = new Set<NavContext>([current]);
  roles.forEach((r) => availableContexts.add(roleToContext(r.name)));

  function switchTo(ctx: NavContext) {
    setOpen(false);
    router.push(CONTEXT_ROOTS[ctx]);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-white/5"
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: meta.bg }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold leading-none truncate" style={{ color: "var(--pc-foreground)" }}>
            {meta.label}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--pc-muted)" }}>
            {meta.sublabel}
          </p>
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{ color: "var(--pc-muted)", transform: open ? "rotate(180deg)" : "" }}
          strokeWidth={2}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-xl z-50 overflow-hidden"
            style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
          >
            {Array.from(availableContexts).map((ctx) => {
              const m = CONTEXT_META[ctx];
              const Ic = m.icon;
              const isCurrent = ctx === current;
              return (
                <button
                  key={ctx}
                  onClick={() => switchTo(ctx)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: m.bg }}
                  >
                    <Ic className="w-3 h-3" style={{ color: m.color }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>{m.label}</p>
                    <p className="text-[10px]" style={{ color: "var(--pc-muted)" }}>{m.sublabel}</p>
                  </div>
                  {isCurrent && (
                    <CheckCheck className="w-3 h-3 flex-shrink-0" style={{ color: "var(--pc-primary)" }} strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main NavShell ───────────────────────────────────────────────── */

export default function NavShell({ context, sections, children }: NavShellProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed]     = useState(false);
  const [cmdOpen, setCmdOpen]         = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);
  const unreadCount = DEMO_NOTIFICATIONS.filter((n) => !n.read).length;

  const { data: rolesResp } = useListRolesV1RolesGet();
  const roles = (rolesResp?.data ?? []) as RoleView[];

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen((v) => !v); }
      if (e.key === "Escape") setCmdOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = useCallback(() => { clearToken(); router.push("/login"); }, [router]);

  const allItems = sections.flatMap((s) => s.items);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--pc-bg)" }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex-shrink-0 flex flex-col transition-all duration-200 border-r",
          collapsed ? "w-[60px]" : "w-[224px]"
        )}
        style={{ background: "#0A0F14", borderColor: "var(--pc-border)" }}
      >
        {/* Brand */}
        <div className="h-14 flex items-center gap-3 px-3.5 border-b flex-shrink-0" style={{ borderColor: "var(--pc-border)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--pc-primary)" }}>
            <Shield className="w-3.5 h-3.5" style={{ color: "#0C1116" }} strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold leading-none" style={{ color: "var(--pc-foreground)" }}>Portcullis</p>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--pc-muted)" }}>MCP Gateway</p>
            </div>
          )}
        </div>

        {/* Context switcher */}
        {!collapsed && (
          <div className="px-2 pt-3 pb-2 border-b" style={{ borderColor: "var(--pc-border)" }}>
            <ContextSwitcher current={context} roles={roles} />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-1.5" style={{ color: "var(--pc-muted)", opacity: 0.6 }}>
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (pathname.startsWith(href + "/") && href !== CONTEXT_ROOTS[context]);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm transition-all duration-150",
                        collapsed ? "justify-center" : "",
                        !active && "hover:bg-white/5"
                      )}
                      style={active
                        ? { background: "rgba(45,212,167,0.12)", color: "var(--pc-primary)" }
                        : { color: "var(--pc-muted)" }}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={active ? 2 : 1.5}
                        style={active ? { color: "var(--pc-primary)" } : {}} />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t space-y-1" style={{ borderColor: "var(--pc-border)" }}>
          <button
            onClick={signOut}
            className={cn("w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5", collapsed && "justify-center")}
            style={{ color: "var(--pc-muted)" }}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && <span>Sign out</span>}
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn("w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5", collapsed && "justify-center")}
            style={{ color: "var(--pc-muted)" }}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              : <><ChevronLeft className="w-4 h-4" strokeWidth={1.5} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex-shrink-0 flex items-center gap-4 px-6 border-b" style={{ background: "#0A0F14", borderColor: "var(--pc-border)" }}>
          {/* Search → full search page */}
          <button
            onClick={() => router.push(`${CONTEXT_ROOTS[context]}/search`)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors flex-1 max-w-sm border"
            style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-left text-xs">Search…</span>
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}>
              <Command className="w-2.5 h-2.5" />K
            </span>
          </button>
          <div className="flex-1" />

          {/* Role count badge */}
          {roles.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: "rgba(45,212,167,0.1)", color: "var(--pc-primary)" }}>
              <Users className="w-3 h-3" strokeWidth={2} />
              {roles.length} role{roles.length !== 1 ? "s" : ""}
            </div>
          )}

          <NotificationBell onClick={() => setNotifOpen((v) => !v)} unreadCount={unreadCount} />
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer select-none" style={{ background: "var(--pc-primary)", color: "#0C1116" }}>
            A
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      {/* ── Command palette ──────────────────────────────────────── */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} context={context} />

      {/* ── Notification panel ───────────────────────────────────── */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <Toaster richColors position="top-right" />
    </div>
  );
}
