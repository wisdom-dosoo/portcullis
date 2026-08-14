"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Download,
  Terminal,
  Code2,
  Server,
  Wrench,
  Clock,
  Shield,
  Globe,
  User,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  useListApiKeysV1ApiKeysGet,
  useCreateApiKeyV1ApiKeysPost,
  useRevokeApiKeyV1ApiKeysKeyIdDelete,
  useListServersV1ServersGet,
  type ApiKeyView,
  type ApiKeyCreateResponse,
} from "@/api/generated";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState, EMPTY_STATES } from "@/components/empty-state";

/* ── types ───────────────────────────────────────────────────────────────── */

interface WizardState {
  // Step 1: Identity
  name: string;
  owner: string;
  environment: "production" | "staging" | "development" | "local" | "";
  description: string;
  // Step 2: Scope
  allowedServers: string[]; // slugs, empty = all
  toolPatterns: string; // comma-separated patterns, empty = all
  // Step 3: Restrictions
  expiration: "7d" | "30d" | "90d" | "1y" | "never" | "custom";
  customExpiry: string; // ISO date string
  rateLimitValue: string;
  rateLimitUnit: "minute" | "hour" | "day";
  ipRanges: string; // comma-separated CIDRs
}

const DEFAULT_STATE: WizardState = {
  name: "",
  owner: "",
  environment: "",
  description: "",
  allowedServers: [],
  toolPatterns: "",
  expiration: "never",
  customExpiry: "",
  rateLimitValue: "",
  rateLimitUnit: "hour",
  ipRanges: "",
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

function buildScopes(s: WizardState): string[] {
  const scopes: string[] = [];
  if (s.environment) scopes.push(`env:${s.environment}`);
  if (s.allowedServers.length > 0) {
    s.allowedServers.forEach(slug => scopes.push(`server:${slug}`));
  } else {
    scopes.push("server:*");
  }
  if (s.toolPatterns.trim()) {
    s.toolPatterns.split(",").map(p => p.trim()).filter(Boolean).forEach(p => scopes.push(`tool:${p}`));
  } else {
    scopes.push("tool:*");
  }
  if (s.expiration !== "never") {
    const expiry = s.expiration === "custom" ? s.customExpiry : computeExpiryDate(s.expiration);
    if (expiry) scopes.push(`expire:${expiry}`);
  }
  if (s.rateLimitValue.trim()) {
    scopes.push(`ratelimit:${s.rateLimitValue}/${s.rateLimitUnit}`);
  }
  if (s.ipRanges.trim()) {
    s.ipRanges.split(",").map(ip => ip.trim()).filter(Boolean).forEach(ip => scopes.push(`ip:${ip}`));
  }
  if (s.owner) scopes.push(`owner:${s.owner}`);
  return scopes;
}

function computeExpiryDate(preset: string): string {
  const now = new Date();
  const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
  if (days[preset]) {
    now.setDate(now.getDate() + days[preset]);
    return now.toISOString().split("T")[0];
  }
  return "";
}

function expiryLabel(preset: string, custom: string): string {
  const map: Record<string, string> = {
    "7d": "7 days",
    "30d": "30 days",
    "90d": "90 days",
    "1y": "1 year",
    never: "Never",
    custom: custom || "Custom",
  };
  return map[preset] ?? preset;
}

function generateEnvSnippet(plaintext: string, name: string): string {
  const envKey = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `# ${name}\nPORTCULLIS_API_KEY=${plaintext}\n# or\nPORTCULLIS_${envKey}_KEY=${plaintext}`;
}

function generateCurl(plaintext: string): string {
  return `curl -X POST https://your-gateway.example.com/mcp/{server-slug} \\
  -H "Authorization: Bearer ${plaintext}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'`;
}

function generatePython(plaintext: string): string {
  return `import httpx

client = httpx.Client(
    base_url="https://your-gateway.example.com",
    headers={"Authorization": f"Bearer ${plaintext}"},
)

response = client.post("/mcp/{server-slug}", json={
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {"name": "tool_name", "arguments": {}},
    "id": 1,
})
print(response.json())`;
}

/* ── sub-components ──────────────────────────────────────────────────────── */

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label} {required && <span style={{ color: "var(--pc-critical)" }}>*</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--pc-muted)", lineHeight: 1.4 }}>{hint}</span>}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--pc-elevated)",
  border: "1px solid var(--pc-border)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--pc-foreground)",
  width: "100%",
  outline: "none",
};

function EnvBadge({ env }: { env: string }) {
  const map: Record<string, { label: string; color: string }> = {
    production: { label: "Production", color: "var(--pc-critical)" },
    staging: { label: "Staging", color: "var(--pc-warning)" },
    development: { label: "Development", color: "var(--pc-secondary)" },
    local: { label: "Local", color: "var(--pc-muted)" },
  };
  const e = map[env] ?? { label: env, color: "var(--pc-muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${e.color}22`,
        color: e.color,
        border: `1px solid ${e.color}44`,
      }}
    >
      {e.label}
    </span>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  const labels = ["Identity", "Scope", "Restrictions", "Review"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {labels.slice(0, total).map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < total - 1 ? 1 : undefined }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: i < current ? "var(--pc-primary)" : i === current ? "#2DD4A733" : "var(--pc-elevated)",
                border: `2px solid ${i <= current ? "var(--pc-primary)" : "var(--pc-border)"}`,
                color: i < current ? "#0C1116" : i === current ? "var(--pc-primary)" : "var(--pc-muted)",
                transition: "all 0.2s",
              }}
            >
              {i < current ? <Check size={13} strokeWidth={3} /> : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i === current ? "var(--pc-primary)" : "var(--pc-muted)", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </div>
          {i < total - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                background: i < current ? "var(--pc-primary)" : "var(--pc-border)",
                margin: "0 4px",
                marginBottom: 16,
                transition: "background 0.2s",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── step 1: identity ────────────────────────────────────────────────────── */

function StepIdentity({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: string) => void }) {
  const envOptions = [
    { value: "production", label: "Production", color: "var(--pc-critical)" },
    { value: "staging", label: "Staging", color: "var(--pc-warning)" },
    { value: "development", label: "Development", color: "var(--pc-secondary)" },
    { value: "local", label: "Local", color: "var(--pc-muted)" },
  ];

  return (
    <div>
      <Field label="Key Name" required hint="A human-readable label for this key (e.g. CI Pipeline, Production Agent)">
        <input
          style={INPUT_STYLE}
          value={state.name}
          onChange={e => set("name", e.target.value)}
          placeholder="e.g. CI Pipeline"
          autoFocus
        />
      </Field>

      <Field label="Owner" hint="Person or team responsible for this key">
        <input
          style={INPUT_STYLE}
          value={state.owner}
          onChange={e => set("owner", e.target.value)}
          placeholder="e.g. backend-team, alice@company.com"
        />
      </Field>

      <Field label="Environment">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {envOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("environment", state.environment === opt.value ? "" : opt.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${state.environment === opt.value ? opt.color : "var(--pc-border)"}`,
                background: state.environment === opt.value ? `${opt.color}18` : "var(--pc-elevated)",
                color: state.environment === opt.value ? opt.color : "var(--pc-muted)",
                fontSize: 13,
                fontWeight: state.environment === opt.value ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Description" hint="Optional notes about what this key is used for">
        <textarea
          style={{ ...INPUT_STYLE, resize: "none", minHeight: 72 }}
          value={state.description}
          onChange={e => set("description", e.target.value)}
          placeholder="Describe where and how this key will be used…"
        />
      </Field>
    </div>
  );
}

/* ── step 2: scope ───────────────────────────────────────────────────────── */

function StepScope({
  state,
  setState,
  servers,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  servers: Array<{ slug: string; name: string }>;
}) {
  function toggleServer(slug: string) {
    setState(s => ({
      ...s,
      allowedServers: s.allowedServers.includes(slug)
        ? s.allowedServers.filter(x => x !== slug)
        : [...s.allowedServers, slug],
    }));
  }

  const allSelected = state.allowedServers.length === 0;

  return (
    <div>
      <Field
        label="Allowed Servers"
        hint="Select which MCP servers this key may access. Leave all unchecked to allow all servers."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* All servers toggle */}
          <button
            type="button"
            onClick={() => setState(s => ({ ...s, allowedServers: [] }))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 6,
              border: `1px solid ${allSelected ? "var(--pc-primary)" : "var(--pc-border)"}`,
              background: allSelected ? "#2DD4A718" : "var(--pc-elevated)",
              color: allSelected ? "var(--pc-primary)" : "var(--pc-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: allSelected ? 600 : 400,
              textAlign: "left",
            }}
          >
            <Globe size={14} />
            All servers (wildcard)
            {allSelected && <Check size={13} strokeWidth={3} style={{ marginLeft: "auto" }} />}
          </button>

          {servers.map(server => {
            const selected = state.allowedServers.includes(server.slug);
            return (
              <button
                key={server.slug}
                type="button"
                onClick={() => toggleServer(server.slug)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: `1px solid ${selected ? "var(--pc-secondary)" : "var(--pc-border)"}`,
                  background: selected ? "#48B8E818" : "var(--pc-elevated)",
                  color: selected ? "var(--pc-secondary)" : "var(--pc-foreground)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: selected ? 600 : 400,
                  textAlign: "left",
                }}
              >
                <Server size={14} style={{ flexShrink: 0, color: selected ? "var(--pc-secondary)" : "var(--pc-muted)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{server.name}</div>
                  <div style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.7 }}>{server.slug}</div>
                </div>
                {selected && <Check size={13} strokeWidth={3} />}
              </button>
            );
          })}

          {servers.length === 0 && (
            <div style={{ padding: "12px", textAlign: "center", color: "var(--pc-muted)", fontSize: 12 }}>
              No servers registered yet — key will default to wildcard access.
            </div>
          )}
        </div>
      </Field>

      <Field
        label="Allowed Tools"
        hint="Comma-separated tool name patterns (e.g. read_*, list_*). Leave blank to allow all tools."
      >
        <div style={{ position: "relative" }}>
          <Wrench size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pc-muted)" }} />
          <input
            style={{ ...INPUT_STYLE, paddingLeft: 30 }}
            value={state.toolPatterns}
            onChange={e =>
              setState(s => ({ ...s, toolPatterns: e.target.value }))
            }
            placeholder="read_*, list_*, get_* (or blank for all)"
          />
        </div>
        {/* Preset chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {["read_*", "list_*", "search_*", "write_*", "create_*", "delete_*"].map(pattern => (
            <button
              key={pattern}
              type="button"
              onClick={() => {
                const existing = state.toolPatterns.split(",").map(p => p.trim()).filter(Boolean);
                const next = existing.includes(pattern)
                  ? existing.filter(p => p !== pattern)
                  : [...existing, pattern];
                setState(s => ({ ...s, toolPatterns: next.join(", ") }));
              }}
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "monospace",
                border: "1px solid var(--pc-border)",
                background: state.toolPatterns.includes(pattern) ? "#48B8E822" : "var(--pc-elevated)",
                color: state.toolPatterns.includes(pattern) ? "var(--pc-secondary)" : "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              {pattern}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

/* ── step 3: restrictions ────────────────────────────────────────────────── */

function StepRestrictions({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const expiryPresets: { value: WizardState["expiration"]; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "1y", label: "1 year" },
    { value: "never", label: "No expiry" },
    { value: "custom", label: "Custom date" },
  ];

  return (
    <div>
      <Field label="Expiration" hint="When should this key stop working?">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {expiryPresets.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setState(s => ({ ...s, expiration: p.value }))}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${state.expiration === p.value ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: state.expiration === p.value ? "#2DD4A718" : "var(--pc-elevated)",
                color: state.expiration === p.value ? "var(--pc-primary)" : "var(--pc-muted)",
                fontSize: 12,
                fontWeight: state.expiration === p.value ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {state.expiration === "custom" && (
          <input
            type="date"
            style={{ ...INPUT_STYLE, marginTop: 8 }}
            value={state.customExpiry}
            onChange={e => setState(s => ({ ...s, customExpiry: e.target.value }))}
            min={new Date().toISOString().split("T")[0]}
          />
        )}
      </Field>

      <Field
        label="Rate Limit"
        hint="Maximum requests per time unit. Leave blank for no rate limit."
      >
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...INPUT_STYLE, flex: 1 }}
            type="number"
            min="1"
            value={state.rateLimitValue}
            onChange={e => setState(s => ({ ...s, rateLimitValue: e.target.value }))}
            placeholder="e.g. 100"
          />
          <select
            style={{
              ...INPUT_STYLE,
              width: "auto",
              paddingRight: 28,
              cursor: "pointer",
            }}
            value={state.rateLimitUnit}
            onChange={e =>
              setState(s => ({ ...s, rateLimitUnit: e.target.value as WizardState["rateLimitUnit"] }))
            }
          >
            <option value="minute">per minute</option>
            <option value="hour">per hour</option>
            <option value="day">per day</option>
          </select>
        </div>
        {/* Quick presets */}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {[
            { v: "60", u: "minute" },
            { v: "1000", u: "hour" },
            { v: "10000", u: "day" },
          ].map(preset => (
            <button
              key={`${preset.v}/${preset.u}`}
              type="button"
              onClick={() => setState(s => ({ ...s, rateLimitValue: preset.v, rateLimitUnit: preset.u as WizardState["rateLimitUnit"] }))}
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 11,
                border: "1px solid var(--pc-border)",
                background: state.rateLimitValue === preset.v && state.rateLimitUnit === preset.u ? "#2DD4A718" : "var(--pc-elevated)",
                color: state.rateLimitValue === preset.v && state.rateLimitUnit === preset.u ? "var(--pc-primary)" : "var(--pc-muted)",
                cursor: "pointer",
              }}
            >
              {preset.v}/{preset.u.charAt(0)}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="IP Allowlist"
        hint="Comma-separated CIDR ranges that may use this key. Leave blank to allow any IP."
      >
        <div style={{ position: "relative" }}>
          <Globe size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pc-muted)" }} />
          <input
            style={{ ...INPUT_STYLE, paddingLeft: 30 }}
            value={state.ipRanges}
            onChange={e => setState(s => ({ ...s, ipRanges: e.target.value }))}
            placeholder="10.0.0.0/8, 192.168.1.0/24"
          />
        </div>
      </Field>
    </div>
  );
}

/* ── step 4: review ──────────────────────────────────────────────────────── */

function StepReview({ state, scopes }: { state: WizardState; scopes: string[] }) {
  const rows = [
    { label: "Name", value: state.name },
    { label: "Owner", value: state.owner || "—" },
    { label: "Environment", value: state.environment ? <EnvBadge env={state.environment} /> : "—" },
    { label: "Description", value: state.description || "—" },
    {
      label: "Servers",
      value:
        state.allowedServers.length === 0
          ? "All servers (*)"
          : state.allowedServers.join(", "),
    },
    {
      label: "Tools",
      value: state.toolPatterns.trim() || "All tools (*)",
    },
    {
      label: "Expiration",
      value: expiryLabel(state.expiration, state.customExpiry),
    },
    {
      label: "Rate Limit",
      value: state.rateLimitValue ? `${state.rateLimitValue} / ${state.rateLimitUnit}` : "None",
    },
    { label: "IP Allowlist", value: state.ipRanges.trim() || "Any" },
  ];

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--pc-muted)", marginBottom: 16 }}>
        Review your configuration before creating the key. The secret will only be shown once.
      </p>
      <div
        style={{
          background: "var(--pc-elevated)",
          border: "1px solid var(--pc-border)",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        {rows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "9px 14px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--pc-border)" : "none",
              gap: 16,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--pc-muted)", flexShrink: 0 }}>{row.label}</span>
            <span style={{ fontSize: 12, color: "var(--pc-foreground)", textAlign: "right", wordBreak: "break-all" }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Encoded scopes preview */}
      <div style={{ background: "#0A0F14", borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 10, color: "var(--pc-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Encoded scopes
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {scopes.map(scope => (
            <code
              key={scope}
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                padding: "2px 6px",
                borderRadius: 3,
                background: "#1B232C",
                color: "var(--pc-secondary)",
              }}
            >
              {scope}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── final screen: key revealed ──────────────────────────────────────────── */

function KeyRevealScreen({
  plaintext,
  keyName,
  onDone,
}: {
  plaintext: string;
  keyName: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<"key" | "env" | "curl" | "python" | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [activeSnippet, setActiveSnippet] = useState<"env" | "curl" | "python">("env");

  const envSnippet = generateEnvSnippet(plaintext, keyName);
  const curlSnippet = generateCurl(plaintext);
  const pythonSnippet = generatePython(plaintext);

  const snippets: Record<string, { label: string; icon: React.ReactNode; code: string; lang: string }> = {
    env: { label: ".env", icon: <Download size={13} />, code: envSnippet, lang: "bash" },
    curl: { label: "cURL", icon: <Terminal size={13} />, code: curlSnippet, lang: "bash" },
    python: { label: "Python", icon: <Code2 size={13} />, code: pythonSnippet, lang: "python" },
  };

  function copy(text: string, type: "key" | "env" | "curl" | "python") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadEnv() {
    const blob = new Blob([envSnippet], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Warning banner */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "12px 14px",
          background: "#F4B94218",
          border: "1px solid #F4B94244",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <AlertTriangle size={16} style={{ color: "var(--pc-warning)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--pc-warning)", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
          This is the only time this secret will be shown. Copy it now — it cannot be retrieved after closing this dialog.
        </p>
      </div>

      {/* Key display */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6 }}>
          Secret Key
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "#0A0F14",
            borderRadius: 8,
            border: "1px solid var(--pc-border)",
          }}
        >
          <code
            style={{
              flex: 1,
              fontSize: 12,
              fontFamily: "monospace",
              color: "var(--pc-primary)",
              wordBreak: "break-all",
              lineHeight: 1.5,
              letterSpacing: showKey ? "0.02em" : "0.08em",
              filter: showKey ? "none" : "blur(5px)",
              userSelect: showKey ? "text" : "none",
            }}
          >
            {plaintext}
          </code>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => setShowKey(v => !v)}
              style={{ padding: 6, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}
              title={showKey ? "Hide" : "Show"}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => copy(plaintext, "key")}
              style={{
                padding: 6,
                borderRadius: 4,
                background: copied === "key" ? "#2DD4A722" : "transparent",
                border: "none",
                cursor: "pointer",
                color: copied === "key" ? "var(--pc-primary)" : "var(--pc-muted)",
              }}
              title="Copy key"
            >
              {copied === "key" ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Code snippets */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
          Integration Examples
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["env", "curl", "python"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSnippet(tab)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                borderRadius: 5,
                border: `1px solid ${activeSnippet === tab ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: activeSnippet === tab ? "#2DD4A718" : "var(--pc-elevated)",
                color: activeSnippet === tab ? "var(--pc-primary)" : "var(--pc-muted)",
                fontSize: 12,
                fontWeight: activeSnippet === tab ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {snippets[tab].icon}
              {snippets[tab].label}
            </button>
          ))}
        </div>

        {/* Code block */}
        <div
          style={{
            background: "#0A0F14",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            padding: "12px 14px",
            position: "relative",
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              fontFamily: "monospace",
              color: "var(--pc-foreground)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.6,
            }}
          >
            {snippets[activeSnippet].code}
          </pre>
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
            {activeSnippet === "env" && (
              <button
                onClick={downloadEnv}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--pc-border)",
                  background: "var(--pc-elevated)",
                  color: "var(--pc-muted)",
                  fontSize: 11,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Download size={11} /> .env
              </button>
            )}
            <button
              onClick={() => copy(snippets[activeSnippet].code, activeSnippet as "env" | "curl" | "python")}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: `1px solid ${copied === activeSnippet ? "var(--pc-primary)" : "var(--pc-border)"}`,
                background: copied === activeSnippet ? "#2DD4A718" : "var(--pc-elevated)",
                color: copied === activeSnippet ? "var(--pc-primary)" : "var(--pc-muted)",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {copied === activeSnippet ? <CheckCircle2 size={11} /> : <Copy size={11} />}
              {copied === activeSnippet ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* Done */}
      <button
        onClick={onDone}
        style={{
          width: "100%",
          padding: "10px",
          background: "var(--pc-primary)",
          border: "none",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: "#0C1116",
          cursor: "pointer",
        }}
      >
        Done — I've saved my key
      </button>
    </div>
  );
}

/* ── create key wizard modal ─────────────────────────────────────────────── */

function CreateKeyModal({
  open,
  onClose,
  servers,
}: {
  open: boolean;
  onClose: () => void;
  servers: Array<{ slug: string; name: string }>;
}) {
  const qc = useQueryClient();
  const createKey = useCreateApiKeyV1ApiKeysPost();

  const [step, setStep] = useState(0); // 0-3 = wizard steps, 4 = reveal
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [revealed, setRevealed] = useState<{ plaintext: string; name: string } | null>(null);

  const scopes = useMemo(() => buildScopes(state), [state]);

  function set(k: keyof WizardState, v: string) {
    setState(s => ({ ...s, [k]: v }));
  }

  function canAdvance(): boolean {
    if (step === 0) return state.name.trim().length > 0;
    return true;
  }

  async function handleSubmit() {
    try {
      const result = await createKey.mutateAsync({
        data: { name: state.name.trim(), scopes },
      });
      const resp = result?.data as ApiKeyCreateResponse | undefined;
      const plaintext = resp?.plaintext ?? null;
      if (!plaintext) throw new Error("No plaintext returned");
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
      setRevealed({ plaintext, name: state.name });
      setStep(4);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to create key"
      );
    }
  }

  function handleClose() {
    onClose();
    setTimeout(() => {
      setStep(0);
      setState(DEFAULT_STATE);
      setRevealed(null);
    }, 300);
  }

  const stepTitles = ["Identity", "Scope", "Restrictions", "Review"];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        style={{
          background: "var(--pc-surface)",
          borderColor: "var(--pc-border)",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--pc-foreground)", fontSize: 15 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(45,212,167,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Key size={16} strokeWidth={1.75} style={{ color: "var(--pc-primary)" }} />
            </div>
            {step === 4 ? "API Key Created" : `Create API Key — ${stepTitles[step]}`}
          </DialogTitle>
        </DialogHeader>

        <div style={{ padding: "4px 0" }}>
          {step < 4 && <StepDots total={4} current={step} />}

          {step === 0 && <StepIdentity state={state} set={set} />}
          {step === 1 && <StepScope state={state} setState={setState} servers={servers} />}
          {step === 2 && <StepRestrictions state={state} setState={setState} />}
          {step === 3 && <StepReview state={state} scopes={scopes} />}
          {step === 4 && revealed && (
            <KeyRevealScreen
              plaintext={revealed.plaintext}
              keyName={revealed.name}
              onDone={handleClose}
            />
          )}

          {step < 4 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--pc-border)" }}>
              <button
                type="button"
                onClick={() => (step === 0 ? handleClose() : setStep(s => s - 1))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                {step === 0 ? <X size={13} /> : <ChevronLeft size={13} />}
                {step === 0 ? "Cancel" : "Back"}
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canAdvance()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    background: canAdvance() ? "var(--pc-primary)" : "var(--pc-elevated)",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: canAdvance() ? "#0C1116" : "var(--pc-muted)",
                    cursor: canAdvance() ? "pointer" : "not-allowed",
                  }}
                >
                  Continue <ChevronRight size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={createKey.isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    background: "var(--pc-primary)",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#0C1116",
                    cursor: "pointer",
                    opacity: createKey.isPending ? 0.6 : 1,
                  }}
                >
                  <Key size={13} />
                  {createKey.isPending ? "Creating…" : "Create Key"}
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const { data: resp, isLoading } = useListApiKeysV1ApiKeysGet();
  const keys = (resp?.data ?? []) as ApiKeyView[];
  const serversResp = useListServersV1ServersGet();
  const servers = useMemo(
    () => (serversResp.data?.data ?? []) as Array<{ slug: string; name: string }>,
    [serversResp.data]
  );
  const revokeKey = useRevokeApiKeyV1ApiKeysKeyIdDelete();

  const [open, setOpen] = useState(false);

  async function handleRevoke(keyId: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? This action cannot be undone.`)) return;
    try {
      await revokeKey.mutateAsync({ keyId });
      toast.success(`"${keyName}" revoked`);
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>
            API Keys
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Bearer tokens for authenticating gateway requests
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Create Key
        </button>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={Key}
            title={EMPTY_STATES.apiKeys.title}
            description={EMPTY_STATES.apiKeys.description}
            features={[...EMPTY_STATES.apiKeys.features]}
            actions={[
              { label: "Create API Key", onClick: () => setOpen(true) },
              { label: EMPTY_STATES.apiKeys.docsAction.label, href: EMPTY_STATES.apiKeys.docsAction.href, variant: "secondary" },
            ]}
          />
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: "var(--pc-elevated)" }}>
              <tr>
                {["Name", "Prefix", "Environment", "Scopes", "Created", "Last Used", ""].map(h => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const envScope = k.scopes.find(s => s.startsWith("env:"))?.replace("env:", "");
                const serverScope = k.scopes.find(s => s.startsWith("server:"))?.replace("server:", "");
                const otherScopes = k.scopes.filter(s => !s.startsWith("env:") && !s.startsWith("owner:"));
                return (
                  <tr
                    key={k.id}
                    className="transition-colors group hover:brightness-110"
                    style={{ borderBottom: "1px solid var(--pc-border)" }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(45,212,167,0.15)" }}
                        >
                          <Key className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
                        </div>
                        <span className="font-medium" style={{ color: "var(--pc-foreground)" }}>{k.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <code
                        className="text-xs font-mono px-2 py-0.5 rounded-md"
                        style={{ color: "var(--pc-secondary)", background: "var(--pc-elevated)" }}
                      >
                        {k.key_prefix}…
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      {envScope ? <EnvBadge env={envScope} /> : <span style={{ color: "var(--pc-muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {otherScopes.slice(0, 3).map(s => (
                          <span
                            key={s}
                            className="text-xs font-mono px-1.5 py-0.5 rounded-md"
                            style={{ background: "rgba(72,184,232,0.12)", color: "#48B8E8" }}
                          >
                            {s}
                          </span>
                        ))}
                        {otherScopes.length > 3 && (
                          <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>+{otherScopes.length - 3}</span>
                        )}
                        {otherScopes.length === 0 && (
                          <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleDateString()
                        : <span style={{ color: "var(--pc-border)" }}>Never</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleRevoke(k.id, k.name)}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 text-xs font-medium transition-all"
                        style={{ color: "var(--pc-critical)" }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreateKeyModal open={open} onClose={() => setOpen(false)} servers={servers} />
    </div>
  );
}
