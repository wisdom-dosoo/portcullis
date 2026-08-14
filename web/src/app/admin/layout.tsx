"use client";

import NavShell, { type NavSection } from "@/components/nav-shell";
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
} from "lucide-react";

const SECTIONS: NavSection[] = [
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
  return (
    <NavShell context="platform-admin" sections={SECTIONS}>
      {children}
    </NavShell>
  );
}
