"use client";

import NavShell, { type NavSection } from "@/components/nav-shell";
import {
  Home,
  Server,
  Wrench,
  Play,
  Key,
  BarChart2,
  ClipboardList,
  BookOpen,
  User,
  Search,
} from "lucide-react";

const SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { href: "/developer",              label: "Home",              icon: Home },
      { href: "/developer/search",       label: "Search",            icon: Search },
      { href: "/developer/servers",      label: "Available Servers", icon: Server },
      { href: "/developer/tools",        label: "Tool Explorer",     icon: Wrench },
      { href: "/developer/playground",   label: "Playground",        icon: Play },
    ],
  },
  {
    label: "My Access",
    items: [
      { href: "/developer/api-keys",     label: "My API Keys",       icon: Key },
      { href: "/developer/usage",        label: "My Usage",          icon: BarChart2 },
      { href: "/developer/logs",         label: "Request Logs",      icon: ClipboardList },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/developer/docs",         label: "Documentation",     icon: BookOpen },
      { href: "/developer/profile",      label: "Profile",           icon: User },
    ],
  },
];

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavShell context="developer" sections={SECTIONS}>
      {children}
    </NavShell>
  );
}
