"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Key, Save, Monitor, Sun, Moon } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type Theme = "dark" | "light" | "system";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

// ─── Input style ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--pc-elevated)",
  border: "1px solid var(--pc-border)",
  color: "var(--pc-foreground)",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

// ─── Section Card ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      {/* Section header */}
      <div
        className="px-6 py-4 border-b"
        style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
          {title}
        </p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            {description}
          </p>
        )}
      </div>

      {/* Section body */}
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Label ─────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--pc-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);

  function handleSave() {
    setSaving(true);
    // Simulate async save
    setTimeout(() => {
      setSaving(false);
      toast.success("Preferences saved");
    }, 600);
  }

  const themeOptions: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: "dark", label: "Dark", icon: Moon },
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Profile
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Your account and preferences
        </p>
      </div>

      {/* Profile section */}
      <SectionCard
        title="Profile"
        description="How others identify you in the workspace"
      >
        <div className="space-y-4">
          {/* Display name */}
          <div>
            <FieldLabel>Display Name</FieldLabel>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--pc-primary)")
              }
              onBlur={(e) => (e.target.style.borderColor = "var(--pc-border)")}
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <FieldLabel>Email</FieldLabel>
            <input
              type="email"
              readOnly
              placeholder="user@example.com"
              style={{
                ...inputStyle,
                opacity: 0.6,
                cursor: "not-allowed",
              }}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--pc-muted)" }}>
              Email is bound to your API key identity and cannot be changed here.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* API Access section */}
      <SectionCard
        title="API Access"
        description="How your identity is established for gateway requests"
      >
        <div
          className="rounded-xl border flex items-start gap-4 px-4 py-4"
          style={{
            background: "rgba(45,212,167,0.05)",
            borderColor: "rgba(45,212,167,0.2)",
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(45,212,167,0.12)" }}
          >
            <Key className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
              Authenticated via API key
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
              Your identity is bound to the API key used to authenticate requests to the
              Portcullis gateway. Rate limits, audit logs, and access controls all use your
              key as the subject identifier. Manage your keys on the{" "}
              <a
                href="/developer/api-keys"
                style={{ color: "var(--pc-primary)", textDecoration: "none" }}
              >
                API Keys
              </a>{" "}
              page.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Preferences section */}
      <SectionCard
        title="Preferences"
        description="Appearance and regional settings"
      >
        <div className="space-y-6">
          {/* Theme selector */}
          <div>
            <FieldLabel>Theme</FieldLabel>
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => {
                const selected = theme === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors"
                    style={{
                      background: selected ? "var(--pc-primary)" : "var(--pc-elevated)",
                      borderColor: selected ? "var(--pc-primary)" : "var(--pc-border)",
                      color: selected ? "#0C1116" : "var(--pc-muted)",
                    }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timezone selector */}
          <div>
            <FieldLabel>Timezone</FieldLabel>
            <div style={{ position: "relative" }}>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: "none",
                  WebkitAppearance: "none",
                  cursor: "pointer",
                  paddingRight: 36,
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--pc-primary)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--pc-border)")
                }
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <svg
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--pc-muted)",
                  pointerEvents: "none",
                }}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Save className="w-4 h-4" strokeWidth={2} />
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
