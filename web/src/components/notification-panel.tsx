"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  Bell,
  CheckCheck,
  Server,
  Key,
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  UserX,
  Wrench,
  Mail,
  Filter,
  ExternalLink,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────────────────────── */

export type NotifType =
  | "server_unavailable"
  | "access_approved"
  | "access_denied"
  | "api_key_expiring"
  | "policy_changed"
  | "usage_threshold"
  | "security_alert"
  | "invitation"
  | "incident_resolved"
  | "new_tool";

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  href?: string;
}

/* ── Demo data ───────────────────────────────────────────────────────────── */

export const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    type: "server_unavailable",
    title: "Server unavailable",
    body: "staging-mcp has failed 3 consecutive health checks and is now marked unhealthy.",
    timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
    read: false,
    href: "/dashboard/servers",
  },
  {
    id: "n2",
    type: "security_alert",
    title: "Security alert",
    body: "18 authentication failures detected from IP 192.168.1.100 in the last 5 minutes.",
    timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
    read: false,
    href: "/dashboard/audit",
  },
  {
    id: "n3",
    type: "usage_threshold",
    title: "Usage threshold reached",
    body: "Your organization has used 90% of its monthly request quota (450k / 500k).",
    timestamp: new Date(Date.now() - 40 * 60_000).toISOString(),
    read: false,
    href: "/dashboard/billing/usage",
  },
  {
    id: "n4",
    type: "access_approved",
    title: "Access request approved",
    body: "Your request to access production-mcp was approved by admin@example.com.",
    timestamp: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    read: true,
    href: "/developer/servers",
  },
  {
    id: "n5",
    type: "api_key_expiring",
    title: "API key expiring soon",
    body: "The key prod-deploy-key expires in 7 days. Rotate it to avoid service disruption.",
    timestamp: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    read: false,
    href: "/dashboard/api-keys",
  },
  {
    id: "n6",
    type: "policy_changed",
    title: "Policy updated",
    body: "The policy default-developer-policy was modified by alice@example.com. Review the changes.",
    timestamp: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    read: true,
    href: "/dashboard/policies",
  },
  {
    id: "n7",
    type: "incident_resolved",
    title: "Incident resolved",
    body: "INC-003 Production error rate spike has been resolved. Duration: 2h 0m.",
    timestamp: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    read: true,
    href: "/dashboard/alerts/incidents/inc-003",
  },
  {
    id: "n8",
    type: "invitation",
    title: "Invitation received",
    body: "You've been invited to join Acme Corp organization by admin@acme.com.",
    timestamp: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    read: true,
    href: "/dashboard/team",
  },
  {
    id: "n9",
    type: "access_denied",
    title: "Access request denied",
    body: "Your request to access dev-mcp was denied. Reason: Out of scope for current project.",
    timestamp: new Date(Date.now() - 86_400_000 * 4).toISOString(),
    read: true,
    href: "/developer/servers",
  },
  {
    id: "n10",
    type: "new_tool",
    title: "New tool available",
    body: "12 new tools were discovered on production-mcp: filesystem/*, github/list_prs, and more.",
    timestamp: new Date(Date.now() - 86_400_000 * 5).toISOString(),
    read: true,
    href: "/developer/tools",
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const NOTIF_CFG: Record<NotifType, { icon: React.ReactNode; color: string; bg: string }> = {
  server_unavailable: { icon: <Server size={14} />,      color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" },
  access_approved:    { icon: <UserCheck size={14} />,   color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)" },
  access_denied:      { icon: <UserX size={14} />,       color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.12)" },
  api_key_expiring:   { icon: <Key size={14} />,         color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  policy_changed:     { icon: <Shield size={14} />,      color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)" },
  usage_threshold:    { icon: <TrendingUp size={14} />,  color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
  security_alert:     { icon: <AlertTriangle size={14} />,color: "var(--pc-critical)",bg: "rgba(240,93,94,0.12)" },
  invitation:         { icon: <Mail size={14} />,        color: "var(--pc-primary)",  bg: "rgba(45,212,167,0.12)" },
  incident_resolved:  { icon: <CheckCircle2 size={14} />,color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)" },
  new_tool:           { icon: <Wrench size={14} />,      color: "var(--pc-primary)",  bg: "rgba(45,212,167,0.12)" },
};

const FILTER_OPTIONS: { value: "all" | "unread" | NotifType; label: string }[] = [
  { value: "all",               label: "All" },
  { value: "unread",            label: "Unread" },
  { value: "server_unavailable",label: "Server" },
  { value: "security_alert",    label: "Security" },
  { value: "api_key_expiring",  label: "API Keys" },
  { value: "usage_threshold",   label: "Usage" },
  { value: "access_approved",   label: "Access" },
  { value: "policy_changed",    label: "Policy" },
];

/* ── Notification item ───────────────────────────────────────────────────── */

function NotifItem({
  notif,
  onRead,
}: {
  notif: Notification;
  onRead: (id: string) => void;
}) {
  const cfg = NOTIF_CFG[notif.type];

  const inner = (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        background: notif.read ? "transparent" : "rgba(45,212,167,0.03)",
        borderBottom: "1px solid var(--pc-border)",
        cursor: "pointer",
        transition: "background 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--pc-elevated)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = notif.read ? "transparent" : "rgba(45,212,167,0.03)")}
      onClick={() => onRead(notif.id)}
    >
      {/* unread dot */}
      {!notif.read && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 6,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--pc-primary)",
          }}
        />
      )}

      {/* icon */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: cfg.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: cfg.color,
          flexShrink: 0,
          marginLeft: 6,
        }}
      >
        {cfg.icon}
      </div>

      {/* content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: notif.read ? 500 : 700, color: "var(--pc-foreground)", lineHeight: 1.3 }}>
            {notif.title}
          </span>
          <span style={{ fontSize: 10, color: "var(--pc-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {relativeTime(notif.timestamp)}
          </span>
        </div>
        <p style={{ fontSize: 11, color: "var(--pc-muted)", lineHeight: 1.5, margin: 0 }}>
          {notif.body}
        </p>
        {notif.href && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 5, fontSize: 10, color: "var(--pc-primary)" }}>
            <ExternalLink size={9} />
            Open resource
          </div>
        )}
      </div>
    </div>
  );

  if (notif.href) {
    return <Link href={notif.href} style={{ textDecoration: "none", display: "block" }}>{inner}</Link>;
  }
  return inner;
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

export function NotificationPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_NOTIFICATIONS);
  const [filter, setFilter] = useState<"all" | "unread" | NotifType>("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  });

  if (!open) return null;

  return (
    <>
      {/* backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 60 }}
        onClick={onClose}
      />

      {/* panel */}
      <div
        style={{
          position: "fixed",
          top: 56,
          right: 0,
          bottom: 0,
          width: 380,
          background: "var(--pc-surface)",
          borderLeft: "1px solid var(--pc-border)",
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.3)",
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--pc-border)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={16} style={{ color: "var(--pc-primary)" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Notifications</span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: "var(--pc-critical)",
                  color: "#fff",
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "var(--pc-primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "3px 6px",
                }}
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
            <Link
              href="/dashboard/notifications"
              onClick={onClose}
              style={{ fontSize: 11, color: "var(--pc-muted)", textDecoration: "none" }}
            >
              View all
            </Link>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", display: "flex", padding: 4 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* filter strip */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "8px 12px",
            borderBottom: "1px solid var(--pc-border)",
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              style={{
                padding: "3px 10px",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${filter === value ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: filter === value ? "rgba(45,212,167,0.1)" : "transparent",
                color: filter === value ? "var(--pc-primary)" : "var(--pc-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Bell size={24} style={{ color: "var(--pc-muted)", margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--pc-foreground)", marginBottom: 4 }}>
                {filter === "unread" ? "No unread notifications" : "No notifications"}
              </p>
              <p style={{ fontSize: 11, color: "var(--pc-muted)" }}>You&apos;re all caught up.</p>
            </div>
          ) : (
            filtered.map((notif) => (
              <NotifItem key={notif.id} notif={notif} onRead={markRead} />
            ))
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--pc-border)",
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            href="/dashboard/notifications?tab=preferences"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "var(--pc-muted)",
              textDecoration: "none",
            }}
          >
            <Filter size={11} />
            Configure preferences
          </Link>
          <span style={{ fontSize: 10, color: "var(--pc-muted)" }}>
            {notifications.length} total
          </span>
        </div>
      </div>
    </>
  );
}

/* ── Bell button with badge (for nav-shell) ──────────────────────────────── */

export function NotificationBell({
  onClick,
  unreadCount,
}: {
  onClick: () => void;
  unreadCount: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--pc-muted)", display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8 }}
      title="Notifications"
    >
      <Bell size={16} strokeWidth={1.5} />
      {unreadCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: 1,
            right: 1,
            minWidth: 14,
            height: 14,
            borderRadius: 9999,
            background: "var(--pc-critical)",
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
