"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, Globe, Lock, Shield, Database } from "lucide-react";

/* ── shared input styles ─────────────────────────────────────────── */

const inputStyle = {
  background: "var(--pc-elevated)",
  borderColor: "var(--pc-border)",
  color: "var(--pc-foreground)",
} as const;

function SectionCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div className="flex items-start gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: iconBg }}
        >
          <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: iconColor }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            {title}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className="block text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--pc-muted)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm rounded-xl border outline-none transition-colors"
      style={inputStyle}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
      style={inputStyle}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className="w-10 h-6 rounded-full transition-colors"
          style={{
            background: checked ? "var(--pc-primary)" : "var(--pc-elevated)",
            border: `1px solid ${checked ? "var(--pc-primary)" : "var(--pc-border)"}`,
          }}
        />
        <div
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform shadow-sm"
          style={{
            background: checked ? "#0C1116" : "var(--pc-muted)",
            transform: checked ? "translateX(16px)" : "translateX(0)",
          }}
        />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
          {label}
        </p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            {description}
          </p>
        )}
      </div>
    </label>
  );
}

function CheckboxOption({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <div
        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors"
        style={{
          background: checked ? "var(--pc-primary)" : "transparent",
          borderColor: checked ? "var(--pc-primary)" : "var(--pc-border)",
        }}
      >
        {checked && (
          <svg
            className="w-2.5 h-2.5"
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M1.5 5L4 7.5L8.5 2.5"
              stroke="#0C1116"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
      <span className="text-sm" style={{ color: "var(--pc-foreground)" }}>
        {label}
      </span>
    </label>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminSettingsPage() {
  /* General */
  const [platformName, setPlatformName] = useState("Portcullis");
  const [supportEmail, setSupportEmail] = useState("");

  /* Authentication */
  const [sessionDuration, setSessionDuration] = useState("8h");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [oauthGitHub, setOauthGitHub] = useState(true);
  const [oauthGoogle, setOauthGoogle] = useState(false);
  const [oauthMicrosoft, setOauthMicrosoft] = useState(false);

  /* Security */
  const [requestSizeLimit, setRequestSizeLimit] = useState("1MB");
  const [defaultTimeout, setDefaultTimeout] = useState("30s");
  const [maxRetries, setMaxRetries] = useState("3");
  const [registrationOpen, setRegistrationOpen] = useState(false);

  /* Data Retention */
  const [auditLogRetention, setAuditLogRetention] = useState("90d");

  function handleSave() {
    // UI only — show success toast
    toast.success("Settings saved", {
      description: "Your configuration has been updated successfully.",
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          System Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Platform-wide configuration and defaults
        </p>
      </div>

      {/* 1 — General */}
      <SectionCard
        icon={Globe}
        iconColor="#48B8E8"
        iconBg="rgba(72,184,232,0.15)"
        title="General"
        description="Basic platform identity and contact information"
      >
        <FormField label="Platform Name" hint="Displayed in the UI and outbound emails">
          <TextInput
            value={platformName}
            onChange={setPlatformName}
            placeholder="Portcullis"
          />
        </FormField>
        <FormField label="Support Email" hint="Used as the reply-to address for system emails">
          <TextInput
            value={supportEmail}
            onChange={setSupportEmail}
            placeholder="support@example.com"
            type="email"
          />
        </FormField>
      </SectionCard>

      {/* 2 — Authentication */}
      <SectionCard
        icon={Lock}
        iconColor="#2DD4A7"
        iconBg="rgba(45,212,167,0.15)"
        title="Authentication"
        description="Session, MFA, and OAuth provider settings"
      >
        <FormField label="Session Duration" hint="How long a user session remains valid">
          <SelectInput
            value={sessionDuration}
            onChange={setSessionDuration}
            options={[
              { value: "1h", label: "1 hour" },
              { value: "8h", label: "8 hours" },
              { value: "24h", label: "24 hours" },
              { value: "7d", label: "7 days" },
            ]}
          />
        </FormField>

        <Toggle
          checked={mfaRequired}
          onChange={setMfaRequired}
          label="Require MFA"
          description="Enforce multi-factor authentication for all users"
        />

        <FormField label="Allowed OAuth Providers">
          <div className="space-y-2.5 pt-0.5">
            <CheckboxOption
              checked={oauthGitHub}
              onChange={setOauthGitHub}
              label="GitHub"
            />
            <CheckboxOption
              checked={oauthGoogle}
              onChange={setOauthGoogle}
              label="Google"
            />
            <CheckboxOption
              checked={oauthMicrosoft}
              onChange={setOauthMicrosoft}
              label="Microsoft"
            />
          </div>
        </FormField>
      </SectionCard>

      {/* 3 — Security */}
      <SectionCard
        icon={Shield}
        iconColor="#F05D5E"
        iconBg="rgba(240,93,94,0.15)"
        title="Security"
        description="Request limits, timeouts, and registration controls"
      >
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Max Request Size">
            <TextInput
              value={requestSizeLimit}
              onChange={setRequestSizeLimit}
              placeholder="1MB"
            />
          </FormField>
          <FormField label="Default Timeout">
            <TextInput
              value={defaultTimeout}
              onChange={setDefaultTimeout}
              placeholder="30s"
            />
          </FormField>
          <FormField label="Max Retries">
            <TextInput
              value={maxRetries}
              onChange={setMaxRetries}
              placeholder="3"
            />
          </FormField>
        </div>

        <Toggle
          checked={registrationOpen}
          onChange={setRegistrationOpen}
          label="Open Registration"
          description="Allow new users to sign up without an invitation"
        />
      </SectionCard>

      {/* 4 — Data Retention */}
      <SectionCard
        icon={Database}
        iconColor="#F4B942"
        iconBg="rgba(244,185,66,0.15)"
        title="Data Retention"
        description="How long platform data is retained before automatic deletion"
      >
        <FormField
          label="Audit Log Retention"
          hint="Audit events older than this threshold will be purged"
        >
          <SelectInput
            value={auditLogRetention}
            onChange={setAuditLogRetention}
            options={[
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "180d", label: "180 days" },
              { value: "365d", label: "1 year" },
              { value: "forever", label: "Forever" },
            ]}
          />
        </FormField>
      </SectionCard>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Save className="w-4 h-4" strokeWidth={2} />
          Save Settings
        </button>
      </div>
    </div>
  );
}
