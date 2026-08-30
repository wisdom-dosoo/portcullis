"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Settings, Shield, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const [gatewayName, setGatewayName] = useState("My Portcullis Gateway");
  const [description, setDescription] = useState("");
  const [defaultDeny, setDefaultDeny] = useState(false);
  const [requireAuth, setRequireAuth] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Settings saved");
  }

  function handleReset() {
    if (!confirm("Reset all policies? This will remove all custom rate limits, roles, and access rules. This cannot be undone.")) return;
    toast.error("All policies have been reset");
  }

  const inputStyle = {
    background: "var(--pc-elevated)",
    borderColor: "var(--pc-border)",
    color: "var(--pc-foreground)",
  };

  const labelStyle = {
    color: "var(--pc-muted)",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2" style={{ background: "rgba(244,185,66,0.10)", borderColor: "rgba(244,185,66,0.35)", color: "#F4B942" }}>
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
        <span style={{ fontWeight: 600 }}>Demo</span>
        <span style={{ color: "var(--pc-muted)" }}>— settings are UI-only until the backend config API lands.</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>Configure your Portcullis gateway preferences</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Gateway Settings */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <div
            className="flex items-center gap-3 px-6 py-4 border-b"
            style={{ borderColor: "var(--pc-border)", background: "var(--pc-elevated)" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(72,184,232,0.15)" }}
            >
              <Settings className="w-4 h-4" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>Gateway Settings</h2>
              <p className="text-xs" style={{ color: "var(--pc-muted)" }}>Basic identity and metadata for your gateway instance</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={labelStyle}>
                Gateway Name
              </label>
              <input
                type="text"
                value={gatewayName}
                onChange={(e) => setGatewayName(e.target.value)}
                placeholder="My Portcullis Gateway"
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                style={inputStyle}
              />
              <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
                Display name shown in the dashboard header and API responses.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={labelStyle}>
                Description
                <span className="ml-1.5 font-normal normal-case" style={{ color: "var(--pc-muted)" }}>optional</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description of this gateway's purpose…"
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none resize-none"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Security */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <div
            className="flex items-center gap-3 px-6 py-4 border-b"
            style={{ borderColor: "var(--pc-border)", background: "var(--pc-elevated)" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(45,212,167,0.15)" }}
            >
              <Shield className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>Security</h2>
              <p className="text-xs" style={{ color: "var(--pc-muted)" }}>Default enforcement behaviour for incoming requests</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>Default deny</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                  Reject all requests that don&apos;t match an explicit allow rule. Recommended for production.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={defaultDeny}
                onClick={() => setDefaultDeny((v) => !v)}
                className="flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                style={{
                  background: defaultDeny ? "var(--pc-primary)" : "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                }}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full transition-transform"
                  style={{
                    background: defaultDeny ? "#0C1116" : "var(--pc-muted)",
                    transform: defaultDeny ? "translateX(24px)" : "translateX(4px)",
                  }}
                />
              </button>
            </div>

            <div
              className="h-px"
              style={{ background: "var(--pc-border)" }}
            />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>Require auth for all tools</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                  Every tool call must carry a valid API key, even for tools not marked as protected.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={requireAuth}
                onClick={() => setRequireAuth((v) => !v)}
                className="flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                style={{
                  background: requireAuth ? "var(--pc-primary)" : "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                }}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full transition-transform"
                  style={{
                    background: requireAuth ? "#0C1116" : "var(--pc-muted)",
                    transform: requireAuth ? "translateX(24px)" : "translateX(4px)",
                  }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "rgba(240,93,94,0.3)" }}
      >
        <div
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{ borderColor: "rgba(240,93,94,0.2)", background: "rgba(240,93,94,0.06)" }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(240,93,94,0.15)" }}
          >
            <AlertTriangle className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F05D5E" }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#F05D5E" }}>Danger Zone</h2>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>Irreversible actions — proceed with caution</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>Reset All Policies</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                Remove all rate limit policies, access rules, and role assignments. Cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={{
                color: "#F05D5E",
                borderColor: "rgba(240,93,94,0.4)",
                background: "rgba(240,93,94,0.06)",
              }}
            >
              Reset All Policies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
