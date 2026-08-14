"use client";

import { useState } from "react";
import {
  Bell,
  CheckCheck,
  Trash2,
  Filter,
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
  ExternalLink,
  Settings,
  Hash,
  Mail as EmailIcon,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import type { Notification, NotifType } from "@/components/notification-panel";
import { DEMO_NOTIFICATIONS } from "@/components/notification-panel";

/* ── Config ──────────────────────────────────────────────────────────────── */

const NOTIF_CFG: Record<NotifType, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  server_unavailable: { icon: <Server size={15} />,       color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)",   label: "Server" },
  access_approved:    { icon: <UserCheck size={15} />,    color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)",  label: "Access" },
  access_denied:      { icon: <UserX size={15} />,        color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.12)", label: "Access" },
  api_key_expiring:   { icon: <Key size={15} />,          color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)",  label: "API Key" },
  policy_changed:     { icon: <Shield size={15} />,       color: "var(--pc-secondary)",bg: "rgba(72,184,232,0.12)",  label: "Policy" },
  usage_threshold:    { icon: <TrendingUp size={15} />,   color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)",  label: "Usage" },
  security_alert:     { icon: <AlertTriangle size={15} />,color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)",   label: "Security" },
  invitation:         { icon: <Mail size={15} />,         color: "var(--pc-primary)",  bg: "rgba(45,212,167,0.12)",  label: "Invitation" },
  incident_resolved:  { icon: <CheckCircle2 size={15} />, color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)",  label: "Incident" },
  new_tool:           { icon: <Wrench size={15} />,       color: "var(--pc-primary)",  bg: "rgba(45,212,167,0.12)",  label: "Tool" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ── Preference channel row ──────────────────────────────────────────────── */

interface PrefRow {
  type: NotifType;
  email: boolean;
  slack: boolean;
  inApp: boolean;
}

const DEFAULT_PREFS: PrefRow[] = [
  { type: "server_unavailable", email: true,  slack: true,  inApp: true },
  { type: "security_alert",     email: true,  slack: true,  inApp: true },
  { type: "access_approved",    email: false, slack: false, inApp: true },
  { type: "access_denied",      email: false, slack: false, inApp: true },
  { type: "api_key_expiring",   email: true,  slack: false, inApp: true },
  { type: "policy_changed",     email: false, slack: true,  inApp: true },
  { type: "usage_threshold",    email: true,  slack: true,  inApp: true },
  { type: "invitation",         email: true,  slack: false, inApp: true },
  { type: "incident_resolved",  email: false, slack: true,  inApp: true },
  { type: "new_tool",           email: false, slack: false, inApp: true },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 9999,
        background: checked ? "var(--pc-primary)" : "var(--pc-elevated)",
        border: `1px solid ${checked ? "var(--pc-primary)" : "var(--pc-border)"}`,
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s, border-color 0.2s",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

type TabId = "inbox" | "preferences";
type FilterValue = "all" | "unread" | NotifType;

export default function NotificationsPage() {
  const [tab, setTab] = useState<TabId>("inbox");
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_NOTIFICATIONS);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [prefs, setPrefs] = useState<PrefRow[]>(DEFAULT_PREFS);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }
  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }
  function deleteNotif(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }
  function togglePref(type: NotifType, channel: "email" | "slack" | "inApp") {
    setPrefs((prev) => prev.map((p) => p.type === type ? { ...p, [channel]: !p[channel] } : p));
  }

  const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
    { value: "all",               label: "All" },
    { value: "unread",            label: `Unread (${unreadCount})` },
    { value: "security_alert",    label: "Security" },
    { value: "server_unavailable",label: "Servers" },
    { value: "api_key_expiring",  label: "API Keys" },
    { value: "usage_threshold",   label: "Usage" },
    { value: "access_approved",   label: "Access" },
    { value: "policy_changed",    label: "Policy" },
    { value: "incident_resolved", label: "Incidents" },
    { value: "new_tool",          label: "Tools" },
    { value: "invitation",        label: "Invitations" },
  ];

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  });

  return (
    <div style={{ color: "var(--pc-foreground)" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Bell size={20} style={{ color: "var(--pc-primary)" }} />
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Notifications</h1>
            {unreadCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 9999, background: "var(--pc-critical)", color: "#fff" }}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
            Stay on top of server health, access changes, and security events.
          </p>
        </div>
        {tab === "inbox" && unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              background: "var(--pc-primary)",
              border: "none",
              borderRadius: 7,
              color: "#0C1116",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--pc-border)", marginBottom: 20 }}>
        {([
          { id: "inbox", label: "Inbox" },
          { id: "preferences", label: "Preferences" },
        ] as { id: TabId; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: tab === id ? "var(--pc-primary)" : "var(--pc-muted)",
              borderBottom: `2px solid ${tab === id ? "var(--pc-primary)" : "transparent"}`,
              marginBottom: -1,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {label === "Inbox" && <Bell size={13} />}
            {label === "Preferences" && <Settings size={13} />}
            {label}
          </button>
        ))}
      </div>

      {tab === "inbox" ? (
        <>
          {/* filter pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Filter size={13} style={{ color: "var(--pc-muted)", alignSelf: "center" }} />
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${filter === value ? "var(--pc-primary)" : "var(--pc-border)"}`,
                  background: filter === value ? "rgba(45,212,167,0.1)" : "transparent",
                  color: filter === value ? "var(--pc-primary)" : "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* notification list */}
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 64,
                textAlign: "center",
                background: "var(--pc-surface)",
                border: "1px solid var(--pc-border)",
                borderRadius: 10,
              }}
            >
              <Bell size={28} style={{ color: "var(--pc-muted)", margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                {filter === "unread" ? "No unread notifications" : "You're all caught up"}
              </p>
              <p style={{ fontSize: 12, color: "var(--pc-muted)" }}>
                New notifications will appear here when something needs your attention.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 10, overflow: "hidden" }}>
              {filtered.map((notif, i) => {
                const cfg = NOTIF_CFG[notif.type];
                return (
                  <div
                    key={notif.id}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "14px 18px",
                      borderBottom: i < filtered.length - 1 ? "1px solid var(--pc-border)" : "none",
                      background: notif.read ? "transparent" : "rgba(45,212,167,0.025)",
                      position: "relative",
                    }}
                  >
                    {/* unread dot */}
                    {!notif.read && (
                      <div style={{ position: "absolute", top: 20, left: 7, width: 6, height: 6, borderRadius: "50%", background: "var(--pc-primary)" }} />
                    )}

                    {/* icon */}
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 9,
                        background: cfg.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: cfg.color,
                        flexShrink: 0,
                        marginLeft: 8,
                      }}
                    >
                      {cfg.icon}
                    </div>

                    {/* content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: notif.read ? 500 : 700, color: "var(--pc-foreground)" }}>
                            {notif.title}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: cfg.bg,
                              color: cfg.color,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                            }}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--pc-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {relativeTime(notif.timestamp)}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--pc-muted)", lineHeight: 1.55, margin: "0 0 8px" }}>
                        {notif.body}
                      </p>
                      <div style={{ display: "flex", gap: 10 }}>
                        {notif.href && (
                          <Link
                            href={notif.href}
                            onClick={() => markRead(notif.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              color: "var(--pc-primary)",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            <ExternalLink size={10} />
                            Open resource
                          </Link>
                        )}
                        {!notif.read && (
                          <button
                            onClick={() => markRead(notif.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              color: "var(--pc-muted)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <CheckCheck size={10} />
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotif(notif.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            color: "var(--pc-muted)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            marginLeft: "auto",
                          }}
                        >
                          <Trash2 size={10} />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* preferences tab */
        <div>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", marginBottom: 20 }}>
            Choose how you receive each type of notification. Changes are saved automatically.
          </p>

          <div style={{ background: "var(--pc-surface)", border: "1px solid var(--pc-border)", borderRadius: 10, overflow: "hidden" }}>
            {/* header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 80px 80px",
                gap: 0,
                padding: "10px 18px",
                borderBottom: "1px solid var(--pc-border)",
                background: "var(--pc-elevated)",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)" }}>Notification type</span>
              {[
                { label: "Email",  icon: <EmailIcon size={11} /> },
                { label: "Slack",  icon: <Hash size={11} /> },
                { label: "In-app", icon: <Smartphone size={11} /> },
              ].map(({ label, icon }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--pc-muted)" }}>
                  {icon} {label}
                </div>
              ))}
            </div>

            {/* rows */}
            {prefs.map((pref, i) => {
              const cfg = NOTIF_CFG[pref.type];
              return (
                <div
                  key={pref.type}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 80px 80px",
                    gap: 0,
                    padding: "12px 18px",
                    borderBottom: i < prefs.length - 1 ? "1px solid var(--pc-border)" : "none",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: cfg.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: cfg.color,
                        flexShrink: 0,
                      }}
                    >
                      {cfg.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--pc-foreground)" }}>{cfg.label}</div>
                      <div style={{ fontSize: 10, color: "var(--pc-muted)", fontFamily: "monospace" }}>{pref.type}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Toggle checked={pref.email} onChange={() => togglePref(pref.type, "email")} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Toggle checked={pref.slack} onChange={() => togglePref(pref.type, "slack")} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Toggle checked={pref.inApp} onChange={() => togglePref(pref.type, "inApp")} />
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 12 }}>
            Slack notifications require the Slack integration to be configured in{" "}
            <Link href="/dashboard/integrations" style={{ color: "var(--pc-primary)", textDecoration: "none" }}>
              Integrations
            </Link>.
          </p>
        </div>
      )}
    </div>
  );
}
