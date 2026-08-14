"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  useCreateServerV1ServersPost,
  type ServerCreate,
} from "@/api/generated";
import {
  ArrowLeft,
  Server,
  Globe,
  ShieldCheck,
  Activity,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Info,
  Wrench,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────────────────── */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/* ── design primitives ───────────────────────────────────────────── */

const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-1 focus:ring-[rgba(45,212,167,0.3)]";

const inputStyle: React.CSSProperties = {
  background: "var(--pc-elevated)",
  borderColor: "var(--pc-border)",
  color: "var(--pc-foreground)",
};

/* ── sub-components ──────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(45,212,167,0.1)" }}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            {title}
          </p>
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
        {label}
        {required && <span style={{ color: "var(--pc-critical)" }}> *</span>}
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
  mono,
  disabled,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type ?? "text"}
      className={`${inputBase} ${mono ? "font-mono" : ""}`}
      style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className={inputBase}
      style={inputStyle}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

function NumberWithSuffix({
  value,
  onChange,
  suffix,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        className={`${inputBase} w-28`}
        style={inputStyle}
        value={value}
        min={min ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-xs" style={{ color: "var(--pc-muted)" }}>
        {suffix}
      </span>
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
      style={{
        background: "rgba(72,184,232,0.08)",
        color: "var(--pc-muted)",
        border: "1px solid rgba(72,184,232,0.15)",
      }}
    >
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#48B8E8" }} strokeWidth={1.75} />
      <span>{children}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: "40px",
        height: "22px",
        borderRadius: "11px",
        background: checked ? "var(--pc-primary)" : "var(--pc-border)",
        position: "relative",
        flexShrink: 0,
        transition: "background 150ms",
        border: "none",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "9px",
          position: "absolute",
          top: "2px",
          left: checked ? "20px" : "2px",
          background: "white",
          transition: "left 150ms",
          display: "block",
        }}
      />
    </button>
  );
}

/* ── connection test panel ────────────────────────────────────────── */

type TestState = "idle" | "testing" | "success" | "error";

interface TestResult {
  latencyMs: number;
  status: number;
  ok: boolean;
}

function ConnectionTestPanel({
  upstreamUrl,
  healthCheckPath,
  slug,
}: {
  upstreamUrl: string;
  healthCheckPath: string;
  slug: string;
}) {
  const [testState, setTestState] = useState<TestState>("idle");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const cleanUrl = upstreamUrl.replace(/\/$/, "");
  const path = healthCheckPath || "/healthz";
  const fullUrl = upstreamUrl ? `${cleanUrl}${path}` : "";
  const urlValid = isValidUrl(upstreamUrl);
  const slugValid = slug.length > 0;

  async function handleTestConnection() {
    if (!urlValid) return;
    setTestState("testing");
    setTestResult(null);
    setTestError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const t0 = performance.now();
    try {
      const res = await fetch(fullUrl, { signal: controller.signal, mode: "no-cors" });
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - t0);
      // no-cors returns opaque response — status 0, treat as reachable
      const ok = res.type === "opaque" || res.ok;
      const status = res.type === "opaque" ? 200 : res.status;
      setTestResult({ latencyMs, status, ok });
      setTestState(ok ? "success" : "error");
    } catch (err) {
      clearTimeout(timer);
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out after 5 seconds"
          : "Network or CORS error — the host may be unreachable from the browser";
      setTestError(msg);
      setTestState("error");
    }
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden sticky top-6"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
    >
      {/* header */}
      <div
        className="flex items-center gap-2.5 px-5 py-4 border-b"
        style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(45,212,167,0.1)" }}
        >
          <Zap className="w-3.5 h-3.5" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
          Connection Test
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Endpoint preview */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color: "var(--pc-muted)" }}>
            Health endpoint
          </p>
          <div
            className="rounded-lg px-3 py-2 text-xs font-mono break-all min-h-[36px]"
            style={{
              background: "var(--pc-elevated)",
              color: upstreamUrl ? "var(--pc-secondary)" : "var(--pc-muted)",
            }}
          >
            {fullUrl || "Enter a Base URL to preview…"}
          </div>
        </div>

        {/* Test connection button */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={!urlValid || testState === "testing"}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: urlValid ? "rgba(45,212,167,0.12)" : "rgba(139,152,167,0.08)",
              color: urlValid ? "var(--pc-primary)" : "var(--pc-muted)",
              border: `1px solid ${urlValid ? "rgba(45,212,167,0.2)" : "var(--pc-border)"}`,
            }}
          >
            {testState === "testing" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Activity className="w-4 h-4" strokeWidth={1.75} />
            )}
            {testState === "testing" ? "Testing…" : "Test Connection"}
          </button>

          {/* Result card */}
          {(testState === "success" || testState === "error") && (
            <div
              className="rounded-xl p-3 space-y-2"
              style={{
                background: testState === "success" ? "rgba(53,200,138,0.06)" : "rgba(240,93,94,0.06)",
                border: `1px solid ${testState === "success" ? "rgba(53,200,138,0.2)" : "rgba(240,93,94,0.2)"}`,
              }}
            >
              <div className="flex items-center gap-2">
                {testState === "success" ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#35C88A" }} strokeWidth={2} />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#F05D5E" }} strokeWidth={2} />
                )}
                <span
                  className="text-xs font-medium"
                  style={{ color: testState === "success" ? "#35C88A" : "#F05D5E" }}
                >
                  {testState === "success" ? "Reachable" : "Unreachable"}
                </span>
              </div>
              {testResult && (
                <div className="flex items-center gap-4 text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                  {testResult.status !== 200 && <span>HTTP {testResult.status}</span>}
                  <span>{testResult.latencyMs} ms</span>
                </div>
              )}
              {testError && (
                <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                  {testError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--pc-border)" }} />

        {/* MCP discover — disabled pre-registration */}
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>
              MCP Tool Discovery
            </p>
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Requires the server to be registered first.
            </p>
          </div>
          <div className="relative group">
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl cursor-not-allowed opacity-40"
              style={{
                background: "rgba(139,152,167,0.08)",
                color: "var(--pc-muted)",
                border: "1px solid var(--pc-border)",
              }}
            >
              <Wrench className="w-4 h-4" strokeWidth={1.75} />
              Discover Tools
            </button>
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
              style={{
                background: "var(--pc-elevated)",
                color: "var(--pc-muted)",
                border: "1px solid var(--pc-border)",
              }}
            >
              Register the server first to test MCP discovery
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--pc-border)" }} />

        {/* Form validity status */}
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: "var(--pc-muted)" }}>
            Form status
          </p>
          {(
            [
              { label: "Name provided", ok: slugValid },
              { label: "Slug provided", ok: slugValid },
              { label: "Base URL valid", ok: urlValid },
            ] as const
          ).map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-2">
              {ok ? (
                <CheckCircle2
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: "#35C88A" }}
                  strokeWidth={2.5}
                />
              ) : (
                <div
                  className="flex-shrink-0 rounded-full border-2"
                  style={{ width: "14px", height: "14px", borderColor: "var(--pc-border)" }}
                />
              )}
              <span
                className="text-xs"
                style={{ color: ok ? "var(--pc-foreground)" : "var(--pc-muted)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function NewServerPage() {
  const router = useRouter();
  const createServer = useCreateServerV1ServersPost();

  /* Basic Info */
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [tags, setTags] = useState("");

  /* Connection */
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [transport] = useState<"streamable_http">("streamable_http");
  const [healthCheckPath, setHealthCheckPath] = useState("/healthz");
  const [timeout, setTimeoutVal] = useState(30);
  const [retryCount, setRetryCount] = useState(3);

  /* Auth */
  const [authMode, setAuthMode] = useState<"none" | "service_token">("none");
  const [serviceTokenEnvVar, setServiceTokenEnvVar] = useState("");

  /* Health check (UI-only) */
  const [healthInterval, setHealthInterval] = useState(60);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [recoveryThreshold, setRecoveryThreshold] = useState(2);

  /* Security (UI-only) */
  const [tlsValidation, setTlsValidation] = useState(true);
  const [requestSizeLimit, setRequestSizeLimit] = useState(1024);
  const [allowedIpRanges, setAllowedIpRanges] = useState("");

  /* Auto-slugify from name unless user has manually edited */
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !upstreamUrl.trim()) {
      toast.error("Name, slug, and base URL are required");
      return;
    }
    if (!isValidUrl(upstreamUrl)) {
      toast.error("Please enter a valid base URL (include http:// or https://)");
      return;
    }

    const payload: ServerCreate = {
      name: name.trim(),
      slug: slug.trim(),
      upstream_url: upstreamUrl.trim(),
      transport,
      auth_mode: authMode,
      health_check_path: healthCheckPath || "/healthz",
      ...(authMode === "service_token" && serviceTokenEnvVar.trim()
        ? { service_token_env_var: serviceTokenEnvVar.trim() }
        : {}),
    };

    try {
      await createServer.mutateAsync({ data: payload });
      toast.success("Server registered successfully");
      router.push(`/dashboard/servers/${slug.trim()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register server";
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/servers"
        className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{ color: "var(--pc-muted)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All servers
      </Link>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(45,212,167,0.12)" }}
        >
          <Server className="w-5 h-5" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--pc-foreground)" }}>
            Add MCP Server
          </h1>
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            Register an upstream MCP server to proxy through Portcullis
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Left column — form (~60%) */}
          <div className="lg:col-span-3 space-y-5">

            {/* 1 · Basic Information */}
            <SectionCard
              icon={<Server className="w-4 h-4" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />}
              title="Basic Information"
              subtitle="Identify this MCP server in your workspace"
            >
              <FieldRow label="Name" required hint="Human-readable display name for this server">
                <TextInput
                  value={name}
                  onChange={setName}
                  placeholder="My MCP Server"
                />
              </FieldRow>

              <FieldRow label="Slug" required hint="URL-safe identifier used in API paths and routing">
                <TextInput
                  value={slug}
                  onChange={(v) => {
                    setSlug(slugify(v));
                    setSlugTouched(true);
                  }}
                  placeholder="my-mcp-server"
                  mono
                />
              </FieldRow>

              <FieldRow label="Description" hint="Optional notes about this server's purpose">
                <textarea
                  className={`${inputBase} resize-none`}
                  style={{ ...inputStyle, minHeight: "72px" }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this server provides…"
                />
              </FieldRow>

              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Environment">
                  <SelectInput value={environment} onChange={setEnvironment}>
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="local">Local</option>
                  </SelectInput>
                </FieldRow>
                <FieldRow label="Tags" hint="Comma-separated">
                  <TextInput
                    value={tags}
                    onChange={setTags}
                    placeholder="tools, ai, internal"
                  />
                </FieldRow>
              </div>

              <InfoNote>
                Environment and Tags are stored locally in the UI only and are not sent to the API.
              </InfoNote>
            </SectionCard>

            {/* 2 · Connection */}
            <SectionCard
              icon={<Globe className="w-4 h-4" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />}
              title="Connection"
              subtitle="How Portcullis reaches the upstream MCP server"
            >
              <FieldRow label="Base URL" required hint="Root URL of the upstream MCP server">
                <TextInput
                  value={upstreamUrl}
                  onChange={setUpstreamUrl}
                  placeholder="http://localhost:3001"
                  mono
                />
              </FieldRow>

              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Transport">
                  <SelectInput value={transport} onChange={() => {}}>
                    <option value="streamable_http">Streamable HTTP</option>
                  </SelectInput>
                </FieldRow>
                <FieldRow label="Protocol Version">
                  <TextInput value="2024-11-05" onChange={() => {}} disabled mono />
                </FieldRow>
              </div>

              <FieldRow label="Health Check Path" hint="Path polled to determine server health">
                <TextInput
                  value={healthCheckPath}
                  onChange={setHealthCheckPath}
                  placeholder="/healthz"
                  mono
                />
              </FieldRow>

              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Timeout">
                  <NumberWithSuffix value={timeout} onChange={setTimeoutVal} suffix="seconds" min={1} />
                </FieldRow>
                <FieldRow label="Retry Count">
                  <NumberWithSuffix value={retryCount} onChange={setRetryCount} suffix="retries" min={0} />
                </FieldRow>
              </div>

              <InfoNote>
                Timeout and Retry Count are UI preferences only and will be supported via API in a future release.
              </InfoNote>
            </SectionCard>

            {/* 3 · Authentication */}
            <SectionCard
              icon={<ShieldCheck className="w-4 h-4" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />}
              title="Authentication"
              subtitle="How Portcullis authenticates with the upstream server"
            >
              <FieldRow label="Auth Mode">
                <SelectInput
                  value={authMode}
                  onChange={(v) => setAuthMode(v as "none" | "service_token")}
                >
                  <option value="none">None</option>
                  <option value="service_token">Service Token</option>
                </SelectInput>
              </FieldRow>

              {authMode === "none" && (
                <div
                  className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
                  style={{
                    background: "rgba(139,152,167,0.06)",
                    color: "var(--pc-muted)",
                    border: "1px solid var(--pc-border)",
                  }}
                >
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>No authentication required. Requests will be forwarded without credentials.</span>
                </div>
              )}

              {authMode === "service_token" && (
                <FieldRow
                  label="Service Token Env Var"
                  hint="Name of the environment variable holding the service token on the gateway server"
                >
                  <TextInput
                    value={serviceTokenEnvVar}
                    onChange={setServiceTokenEnvVar}
                    placeholder="MY_SERVICE_TOKEN"
                    mono
                  />
                </FieldRow>
              )}
            </SectionCard>

            {/* 4 · Health Check (UI-only) */}
            <SectionCard
              icon={<Activity className="w-4 h-4" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />}
              title="Health Check"
              subtitle="Configure automated health monitoring behaviour"
            >
              <FieldRow label="Check Interval">
                <NumberWithSuffix
                  value={healthInterval}
                  onChange={setHealthInterval}
                  suffix="seconds"
                  min={10}
                />
              </FieldRow>

              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Failure Threshold" hint="Consecutive failures before marking unhealthy">
                  <NumberWithSuffix
                    value={failureThreshold}
                    onChange={setFailureThreshold}
                    suffix="failures"
                    min={1}
                  />
                </FieldRow>
                <FieldRow label="Recovery Threshold" hint="Consecutive successes before marking healthy">
                  <NumberWithSuffix
                    value={recoveryThreshold}
                    onChange={setRecoveryThreshold}
                    suffix="successes"
                    min={1}
                  />
                </FieldRow>
              </div>

              <InfoNote>
                These health check parameters are UI-only and will be configurable via API in a future release.
                The gateway currently uses its own internal defaults.
              </InfoNote>
            </SectionCard>

            {/* 5 · Security (UI-only) */}
            <SectionCard
              icon={<Lock className="w-4 h-4" style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />}
              title="Security"
              subtitle="Additional security controls for upstream communication"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
                    TLS Validation
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                    Verify TLS certificates when connecting upstream
                  </p>
                </div>
                <Toggle checked={tlsValidation} onChange={setTlsValidation} />
              </div>

              <FieldRow label="Request Size Limit" hint="Maximum incoming request body size">
                <NumberWithSuffix
                  value={requestSizeLimit}
                  onChange={setRequestSizeLimit}
                  suffix="KB"
                  min={1}
                />
              </FieldRow>

              <FieldRow label="Allowed IP Ranges" hint="One CIDR block per line. Leave empty to allow all.">
                <textarea
                  className={`${inputBase} resize-none font-mono text-xs`}
                  style={{ ...inputStyle, minHeight: "80px" }}
                  value={allowedIpRanges}
                  onChange={(e) => setAllowedIpRanges(e.target.value)}
                  placeholder={"10.0.0.0/8\n192.168.1.0/24"}
                />
              </FieldRow>

              <InfoNote>
                Security fields (TLS Validation, Request Size Limit, Allowed IP Ranges) are UI-only and
                will be supported via API in a future release.
              </InfoNote>
            </SectionCard>

            {/* Submit row */}
            <div className="flex items-center gap-3 pb-8">
              <button
                type="submit"
                disabled={createServer.isPending || !name.trim() || !slug.trim() || !upstreamUrl.trim()}
                className="flex items-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                {createServer.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Server className="w-4 h-4" strokeWidth={2} />
                )}
                {createServer.isPending ? "Registering…" : "Register Server"}
              </button>
              <Link
                href="/dashboard/servers"
                className="text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                style={{ color: "var(--pc-muted)" }}
              >
                Cancel
              </Link>
            </div>
          </div>

          {/* Right column — test panel (~40%) */}
          <div className="lg:col-span-2">
            <ConnectionTestPanel
              upstreamUrl={upstreamUrl}
              healthCheckPath={healthCheckPath}
              slug={slug}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
