"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import NavShell, { type NavSection } from "@/components/nav-shell";
import { PortcullisLoader } from "@/components/loading-state";
import { isAuthenticated } from "@/lib/auth";
import { usePlatformAdminMeAdminPlatformMeGet } from "@/api/generated";
import {
  LayoutDashboard,
  Building2,
  Users,
  Server,
  Wrench,
  Shield,
  BarChart3,
  ClipboardList,
  Lock,
  Cpu,
  CreditCard,
  Settings,
  Radar,
} from "lucide-react";

const ALL_SECTIONS: NavSection[] = [
  {
    label: "Platform",
    items: [
      { href: "/admin",                  label: "Overview",        icon: LayoutDashboard },
      { href: "/admin/organizations",    label: "Organizations",   icon: Building2 },
      { href: "/admin/users",            label: "Users",           icon: Users },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/admin/servers",          label: "MCP Servers",     icon: Server },
      { href: "/admin/tools",            label: "Tool Registry",   icon: Wrench },
      { href: "/admin/policies",         label: "Policies",        icon: Shield },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/admin/traffic",          label: "Traffic",         icon: BarChart3 },
      { href: "/admin/audit",            label: "Audit Logs",      icon: ClipboardList },
      { href: "/admin/security",         label: "Security",        icon: Lock },
      { href: "/admin/infrastructure",   label: "Infrastructure",  icon: Cpu },
      { href: "/admin/telemetry",        label: "Telemetry",       icon: Radar },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/billing",          label: "Billing",         icon: CreditCard },
      { href: "/admin/settings",         label: "System Settings", icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const adminResp = usePlatformAdminMeAdminPlatformMeGet({
    query: {
      enabled: isAuthenticated() && typeof window !== "undefined",
      retry: false,
    },
  });

  const isPlatformAdmin = adminResp.data?.status === 200;

  // Non-admin or stale session → bounce to the org dashboard.
  useEffect(() => {
    if (adminResp.isSuccess && !isPlatformAdmin) {
      router.replace("/dashboard");
    }
  }, [adminResp.isSuccess, isPlatformAdmin, router]);

  // Not authenticated at all → login.
  useEffect(() => {
    if (typeof window !== "undefined" && !isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  if (!isAuthenticated() || adminResp.isLoading || adminResp.isFetching) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--pc-bg)" }}>
        <PortcullisLoader label="Verifying admin access…" />
      </div>
    );
  }

  // 403 / 401 → treated as non-admin (redirect effect above handles the path).
  if (adminResp.isError || !isPlatformAdmin) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--pc-bg)" }}>
        <PortcullisLoader label="Redirecting…" />
      </div>
    );
  }

  return (
    <NavShell context="platform-admin" sections={ALL_SECTIONS}>
      {children}
    </NavShell>
  );
}