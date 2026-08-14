"use client";

import NavShell, { type NavSection } from "@/components/nav-shell";
import {
  LayoutDashboard,
  Server,
  Wrench,
  Play,
  Shield,
  Key,
  Users,
  BarChart3,
  Activity,
  ClipboardList,
  Bell,
  BellDot,
  Puzzle,
  CreditCard,
  Settings,
  Zap,
  Search,
} from "lucide-react";

const SECTIONS: NavSection[] = [
  {
    label: "Gateway",
    items: [
      { href: "/dashboard",            label: "Overview",    icon: LayoutDashboard },
      { href: "/dashboard/search",     label: "Search",      icon: Search },
      { href: "/dashboard/servers",    label: "Servers",     icon: Server },
      { href: "/dashboard/tools",      label: "Tools",       icon: Wrench },
      { href: "/dashboard/playground", label: "Playground",  icon: Play },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/dashboard/policies",    label: "Policies",    icon: Shield },
      { href: "/dashboard/api-keys",    label: "API Keys",    icon: Key },
      { href: "/dashboard/rate-limits", label: "Rate Limits", icon: Zap },
    ],
  },
  {
    label: "Observability",
    items: [
      { href: "/dashboard/traffic",   label: "Traffic",   icon: BarChart3 },
      { href: "/dashboard/analytics", label: "Analytics", icon: Activity },
      { href: "/dashboard/audit",     label: "Audit Log", icon: ClipboardList },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/dashboard/team",            label: "Team",          icon: Users },
      { href: "/dashboard/alerts",          label: "Alerts",        icon: Bell },
      { href: "/dashboard/notifications",   label: "Notifications", icon: BellDot },
      { href: "/dashboard/integrations",    label: "Integrations",  icon: Puzzle },
      { href: "/dashboard/billing",         label: "Billing",       icon: CreditCard },
      { href: "/dashboard/settings",        label: "Settings",      icon: Settings },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavShell context="org-admin" sections={SECTIONS}>
      {children}
    </NavShell>
  );
}
