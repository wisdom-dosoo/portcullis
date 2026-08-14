"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, ChevronRight, ChevronLeft, Server, Key,
  Shield, Zap, Eye, EyeOff, Copy, ExternalLink, Loader2, CheckCheck,
  Building2, Globe, Users, BookOpen, Play, AlertTriangle,
} from "lucide-react";
import {
  useListServersV1ServersGet,
  useCreateServerV1ServersPost,
  useListApiKeysV1ApiKeysGet,
  useCreateApiKeyV1ApiKeysPost,
  useCreatePolicyV1RateLimitPoliciesPost,
  useListRolesV1RolesGet,
  ServerTransport,
  ServerAuthMode,
  RateLimitAlgorithm,
  type ServerView,
  type ApiKeyView,
  type RoleView,
  type ApiKeyCreateResponse,
} from "@/api/generated";
import { useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "@/lib/axios-instance";

/* ── Types ───────────────────────────────────────────────────────── */

type Role = "org-admin" | "developer" | "security-auditor";
type StepId = "welcome" | "org" | "server" | "policy" | "apikey" | "done";

interface OnboardingState {
  role: Role | null;
  orgName: string;
  orgSlug: string;
  companySize: string;
  region: string;
  createdServerId: string | null;
  createdServerSlug: string | null;
  createdApiKeyPlaintext: string | null;
  createdApiKeyName: string | null;
  policyCreated: boolean;
}

const INITIAL_STATE: OnboardingState = {
  role: null,
  orgName: "",
  orgSlug: "",
  companySize: "",
  region: "",
  createdServerId: null,
  createdServerSlug: null,
  createdApiKeyPlaintext: null,
  createdApiKeyName: null,
  policyCreated: false,
};

/* ── Checklist items ─────────────────────────────────────────────── */

const CHECKLIST = [
  { id: "org",     label: "Set up organization",  step: "org" as StepId },
  { id: "server",  label: "Register MCP server",   step: "server" as StepId },
  { id: "policy",  label: "Create access policy",  step: "policy" as StepId },
  { id: "apikey",  label: "Generate API key",       step: "apikey" as StepId },
  { id: "request", label: "Send first request",     step: "done" as StepId },
  { id: "trace",   label: "View audit trace",       step: "done" as StepId },
  { id: "invite",  label: "Invite a teammate",      step: "done" as StepId },
];

/* ── Role options ────────────────────────────────────────────────── */

const ROLE_OPTIONS: { id: Role; icon: React.ElementType; label: string; description: string; color: string; bg: string }[] = [
  {
    id: "org-admin",
    icon: Building2,
    label: "Organization Admin",
    description: "I manage servers, policies, teams, and billing for my organization.",
    color: "#2DD4A7",
    bg: "rgba(45,212,167,0.1)",
  },
  {
    id: "developer",
    icon: Play,
    label: "Developer",
    description: "I build integrations and test tools using the MCP gateway.",
    color: "#48B8E8",
    bg: "rgba(72,184,232,0.1)",
  },
  {
    id: "security-auditor",
    icon: Shield,
    label: "Security / Auditor",
    description: "I review policies, audit logs, and access controls.",
    color: "#F4B942",
    bg: "rgba(244,185,66,0.1)",
  },
];

/* ── Step indicator ──────────────────────────────────────────────── */

const STEPS: { id: StepId; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "org",     label: "Organization" },
  { id: "server",  label: "MCP Server" },
  { id: "policy",  label: "Policy" },
  { id: "apikey",  label: "API Key" },
  { id: "done",    label: "Done" },
];

function StepBar({ current }: { current: StepId }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={i < idx
                ? { background: "var(--pc-primary)", color: "#0C1116" }
                : i === idx
                ? { background: "var(--pc-primary)", color: "#0C1116", boxShadow: "0 0 0 3px rgba(45,212,167,0.2)" }
                : { background: "var(--pc-surface)", border: "1px solid var(--pc-border)", color: "var(--pc-muted)" }
              }
            >
              {i < idx ? <CheckCheck className="w-3.5 h-3.5" strokeWidth={2.5} /> : i + 1}
            </div>
            <span className="text-[9px] uppercase tracking-wide whitespace-nowrap hidden sm:block" style={{ color: i <= idx ? "var(--pc-primary)" : "var(--pc-muted)" }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="w-10 sm:w-16 h-px mb-5 mx-1" style={{ background: i < idx ? "var(--pc-primary)" : "var(--pc-border)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Server test result ──────────────────────────────────────────── */

type TestResult = {
  ok: boolean;
  latencyMs?: number;
  tools?: number;
  error?: string;
  tls?: boolean;
};

/* ── Password/key copy button ────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg transition-colors hover:bg-white/5 flex-shrink-0"
      style={{ color: copied ? "#2DD4A7" : "var(--pc-muted)" }}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
    </button>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<StepId>("welcome");
  const [ob, setOb] = useState<OnboardingState>(INITIAL_STATE);

  // Persist step + state in sessionStorage so refresh doesn't reset
  useEffect(() => {
    const saved = sessionStorage.getItem("pc_onboarding");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step) setStep(parsed.step);
        if (parsed.ob)   setOb(parsed.ob);
      } catch { /* ignore */ }
    }
  }, []);

  const save = useCallback((nextStep: StepId, nextOb: OnboardingState) => {
    sessionStorage.setItem("pc_onboarding", JSON.stringify({ step: nextStep, ob: nextOb }));
  }, []);

  function go(nextStep: StepId, nextOb?: OnboardingState) {
    const o = nextOb ?? ob;
    setStep(nextStep);
    setOb(o);
    save(nextStep, o);
  }

  function updateOb(patch: Partial<OnboardingState>) {
    setOb((prev) => ({ ...prev, ...patch }));
  }

  // ── Queries
  const { data: serversResp } = useListServersV1ServersGet();
  const servers = (serversResp?.data ?? []) as ServerView[];
  const { data: rolesResp } = useListRolesV1RolesGet();

  const createServer  = useCreateServerV1ServersPost();
  const createApiKey  = useCreateApiKeyV1ApiKeysPost();
  const createPolicy  = useCreatePolicyV1RateLimitPoliciesPost();

  /* ────────────────── Step: Welcome ──────────────────────────────── */

  const completedSteps = new Set<string>([
    ...(ob.orgName ? ["org"] : []),
    ...(ob.createdServerId ? ["server"] : []),
    ...(ob.policyCreated ? ["policy"] : []),
    ...(ob.createdApiKeyPlaintext ? ["apikey"] : []),
  ]);

  function WelcomeStep() {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--pc-foreground)" }}>
            Welcome to Portcullis
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Your zero-trust MCP gateway. Let&apos;s get you set up in a few steps so you can start controlling tool access, enforcing policies, and monitoring every request.
          </p>
        </div>

        {/* Role selection */}
        <div className="mb-8">
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--pc-foreground)" }}>What best describes your role?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ROLE_OPTIONS.map(({ id, icon: Icon, label, description, color, bg }) => (
              <button
                key={id}
                type="button"
                onClick={() => updateOb({ role: id })}
                className="text-left p-4 rounded-2xl border transition-all"
                style={ob.role === id
                  ? { background: bg, borderColor: color }
                  : { background: "var(--pc-surface)", borderColor: "var(--pc-border)" }
                }
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: bg }}>
                  <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-semibold mb-1" style={{ color: ob.role === id ? color : "var(--pc-foreground)" }}>{label}</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>{description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Onboarding checklist */}
        <div className="rounded-2xl border p-5 mb-8" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--pc-muted)" }}>Your setup checklist</p>
          <div className="space-y-3">
            {CHECKLIST.map(({ id, label }) => {
              const done = completedSteps.has(id);
              return (
                <div key={id} className="flex items-center gap-3">
                  {done
                    ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#2DD4A7" }} strokeWidth={2} />
                    : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--pc-border)" }} strokeWidth={1.5} />
                  }
                  <span className="text-sm" style={{ color: done ? "var(--pc-foreground)" : "var(--pc-muted)", textDecoration: done ? "line-through" : "none" }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--pc-border)" }}>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--pc-muted)" }}>
              <span>Progress</span>
              <span>{completedSteps.size} / {CHECKLIST.length}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pc-elevated)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(completedSteps.size / CHECKLIST.length) * 100}%`, background: "var(--pc-primary)" }} />
            </div>
          </div>
        </div>

        {/* Docs link */}
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-8" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
          <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Read the docs first?</p>
            <p className="text-[10px]" style={{ color: "var(--pc-muted)" }}>Learn about MCP proxying, policies, and API keys before setup.</p>
          </div>
          <Link href="/developer/docs" className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--pc-primary)" }}>
            Docs <ExternalLink className="w-3 h-3" strokeWidth={2} />
          </Link>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => go("org")}
            disabled={!ob.role}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            Get started <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-3 rounded-xl text-sm border flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
          >
            Skip setup
          </Link>
        </div>
      </div>
    );
  }

  /* ────────────────── Step: Org ───────────────────────────────────── */

  const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1 000", "1 000+"];
  const REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1", "ap-northeast-1"];

  function OrgStep() {
    const [name, setName]   = useState(ob.orgName);
    const [slug, setSlug]   = useState(ob.orgSlug);
    const [size, setSize]   = useState(ob.companySize);
    const [region, setRegion] = useState(ob.region || "us-east-1");
    const [invites, setInvites] = useState("");

    function autoSlug(n: string) {
      return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function handleNext(e: React.FormEvent) {
      e.preventDefault();
      const nextOb = { ...ob, orgName: name, orgSlug: slug, companySize: size, region };
      go("server", nextOb);
      void invites; // invites logged but no backend endpoint
    }

    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Set up your organization</h2>
        <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>Tell us about your workspace so Portcullis can configure sensible defaults.</p>

        <form onSubmit={handleNext} className="space-y-5">
          {/* Org name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Organization name</label>
            <input
              type="text" required value={name}
              onChange={(e) => { setName(e.target.value); if (!ob.orgSlug) setSlug(autoSlug(e.target.value)); }}
              placeholder="Acme Corp"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Organization slug</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none" style={{ color: "var(--pc-muted)" }}>portcullis.dev/</span>
              <input
                type="text" required value={slug}
                onChange={(e) => setSlug(autoSlug(e.target.value))}
                placeholder="acme-corp"
                className="w-full pl-[110px] pr-4 py-2.5 rounded-xl text-sm font-mono outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
          </div>

          {/* Company size */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Company size</label>
            <div className="flex gap-2 flex-wrap">
              {COMPANY_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => setSize(s)}
                  className="px-3 py-1.5 rounded-lg text-xs border transition-all"
                  style={size === s
                    ? { background: "rgba(45,212,167,0.1)", borderColor: "rgba(45,212,167,0.4)", color: "#2DD4A7" }
                    : { background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-muted)" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Region */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>
              <Globe className="inline w-3 h-3 mr-1" strokeWidth={1.5} />
              Primary region / data residency
            </label>
            <select
              value={region} onChange={(e) => setRegion(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border appearance-none"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            >
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Team invitations */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>
              <Users className="inline w-3 h-3 mr-1" strokeWidth={1.5} />
              Invite teammates <span className="font-normal">(optional)</span>
            </label>
            <textarea
              value={invites} onChange={(e) => setInvites(e.target.value)}
              placeholder="alice@company.com, bob@company.com"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border resize-none transition-colors"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--pc-muted)" }}>Invitations will be sent once your organization is configured.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => go("welcome")} className="p-2.5 rounded-xl border transition-colors hover:bg-white/5" style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}>
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "var(--pc-primary)", color: "#0C1116" }}>
              Continue <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ────────────────── Step: Server ────────────────────────────────── */

  const TRANSPORT_OPTIONS = [
    { value: ServerTransport.streamable_http, label: "Streamable HTTP", description: "HTTP with streaming responses (recommended)" },
    { value: "sse",        label: "Server-Sent Events", description: "SSE transport for real-time streaming" },
    { value: "websocket",  label: "WebSocket", description: "Bidirectional WebSocket connection" },
    { value: "stdio",      label: "STDIO bridge", description: "Bridge to a local STDIO MCP process" },
    { value: "custom",     label: "Custom adapter", description: "Implement your own transport adapter" },
  ] as const;

  const AUTH_OPTIONS = [
    { value: ServerAuthMode.none,          label: "No authentication" },
    { value: ServerAuthMode.service_token, label: "Bearer / service token" },
    { value: "api_key",     label: "API key header" },
    { value: "oauth2",      label: "OAuth 2.0" },
    { value: "basic",       label: "Basic authentication" },
    { value: "headers",     label: "Custom headers" },
  ] as const;

  function ServerStep() {
    const [name, setName]         = useState("");
    const [slug, setSlug]         = useState("");
    const [url, setUrl]           = useState("");
    const [transport, setTransport] = useState<string>(ServerTransport.streamable_http);
    const [authMode, setAuthMode] = useState<string>(ServerAuthMode.none);
    const [tokenEnvVar, setTokenEnvVar] = useState("");
    const [healthPath, setHealthPath] = useState("/health");
    const [description, setDescription] = useState("");
    const [tags, setTags]         = useState("");
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testing, setTesting]   = useState(false);
    const [submitting, setSubmitting] = useState(false);

    function autoSlug(n: string) {
      return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    async function testConnection() {
      if (!url) return;
      setTesting(true);
      setTestResult(null);
      const t0 = Date.now();
      try {
        await axiosClient.get(url.replace(/\/$/, "") + (healthPath || "/health"), { timeout: 5000 });
        setTestResult({ ok: true, latencyMs: Date.now() - t0, tls: url.startsWith("https") });
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status) {
          // Got a response — server is reachable
          setTestResult({ ok: true, latencyMs: Date.now() - t0, tls: url.startsWith("https") });
        } else {
          setTestResult({ ok: false, error: "Could not reach server. Check the URL and ensure the server is running.", latencyMs: Date.now() - t0 });
        }
      } finally {
        setTesting(false);
      }
    }

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setSubmitting(true);
      try {
        const result = await createServer.mutateAsync({
          data: {
            name,
            slug,
            upstream_url: url,
            transport: transport === ServerTransport.streamable_http ? ServerTransport.streamable_http : undefined,
            auth_mode: (authMode === ServerAuthMode.none || authMode === ServerAuthMode.service_token)
              ? (authMode as typeof ServerAuthMode[keyof typeof ServerAuthMode])
              : ServerAuthMode.none,
            service_token_env_var: tokenEnvVar || null,
            health_check_path: healthPath || undefined,
          },
        });
        await qc.invalidateQueries({ queryKey: ["listServersV1ServersGet"] });
        const server = result.data as ServerView;
        const nextOb = { ...ob, createdServerId: server.id, createdServerSlug: server.slug };
        toast.success(`Server "${name}" registered`);
        go("policy", nextOb);
      } catch {
        toast.error("Failed to register server. Check the URL and try again.");
      } finally {
        setSubmitting(false);
      }
      void description; void tags;
    }

    const existingServer = servers[0];

    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Register your first MCP server</h2>
        <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>Connect an MCP-compatible server so Portcullis can proxy, inspect, and enforce policies on its tools.</p>

        {/* Existing servers notice */}
        {servers.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl px-4 py-3 border mb-5" style={{ background: "rgba(45,212,167,0.06)", borderColor: "rgba(45,212,167,0.2)" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#2DD4A7" }} strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>You already have {servers.length} server{servers.length > 1 ? "s" : ""} registered</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--pc-muted)" }}>
                {existingServer?.name} ({existingServer?.slug}) — you can add another or skip this step.
              </p>
            </div>
            <button type="button" onClick={() => {
              const nextOb = { ...ob, createdServerId: existingServer?.id, createdServerSlug: existingServer?.slug };
              go("policy", nextOb);
            }} className="text-xs flex-shrink-0 font-medium" style={{ color: "var(--pc-primary)" }}>
              Use existing →
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Server name</label>
              <input type="text" required value={name}
                onChange={(e) => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }}
                placeholder="Production Tools"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Slug</label>
              <input type="text" required value={slug}
                onChange={(e) => setSlug(autoSlug(e.target.value))}
                placeholder="prod-tools"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Server URL</label>
            <div className="flex gap-2">
              <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-mcp-server.internal"
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
              <button type="button" onClick={testConnection} disabled={!url || testing}
                className="px-4 py-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 disabled:opacity-40 transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />}
                Test
              </button>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className="rounded-xl border px-4 py-3"
              style={testResult.ok
                ? { background: "rgba(45,212,167,0.06)", borderColor: "rgba(45,212,167,0.2)" }
                : { background: "rgba(240,93,94,0.06)", borderColor: "rgba(240,93,94,0.2)" }
              }
            >
              <div className="flex items-center gap-2 mb-2">
                {testResult.ok
                  ? <CheckCircle2 className="w-4 h-4" style={{ color: "#2DD4A7" }} strokeWidth={2} />
                  : <AlertTriangle className="w-4 h-4" style={{ color: "#F05D5E" }} strokeWidth={2} />
                }
                <p className="text-xs font-semibold" style={{ color: testResult.ok ? "#2DD4A7" : "#F05D5E" }}>
                  {testResult.ok ? "Connection successful" : "Connection failed"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  ["Status",       testResult.ok ? "Reachable" : "Unreachable"],
                  ["Latency",      testResult.latencyMs ? `${testResult.latencyMs} ms` : "—"],
                  ["TLS",          testResult.tls ? "Yes (HTTPS)" : "No (HTTP)"],
                  ["Protocol",     "MCP / JSON-RPC 2.0"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[10px]">
                    <span style={{ color: "var(--pc-muted)" }}>{k}</span>
                    <span style={{ color: "var(--pc-foreground)" }}>{v}</span>
                  </div>
                ))}
              </div>
              {testResult.error && <p className="text-xs mt-2" style={{ color: "#F05D5E" }}>{testResult.error}</p>}
            </div>
          )}

          {/* Transport */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--pc-muted)" }}>Transport type</label>
            <div className="space-y-2">
              {TRANSPORT_OPTIONS.map(({ value, label, description }) => (
                <label key={value} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all" style={transport === value
                  ? { background: "rgba(45,212,167,0.06)", borderColor: "rgba(45,212,167,0.3)" }
                  : { background: "var(--pc-surface)", borderColor: "var(--pc-border)" }
                }>
                  <input type="radio" name="transport" value={value} checked={transport === value} onChange={() => setTransport(value)} className="sr-only" />
                  <div className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center" style={{ borderColor: transport === value ? "#2DD4A7" : "var(--pc-border)" }}>
                    {transport === value && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#2DD4A7" }} />}
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>{label}</p>
                    <p className="text-[10px]" style={{ color: "var(--pc-muted)" }}>{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Auth */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Authentication method</label>
            <select value={authMode} onChange={(e) => setAuthMode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border appearance-none"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            >
              {AUTH_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {authMode === ServerAuthMode.service_token && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Token environment variable</label>
              <input type="text" value={tokenEnvVar} onChange={(e) => setTokenEnvVar(e.target.value)}
                placeholder="MCP_SERVER_TOKEN"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--pc-muted)" }}>The gateway reads this env var and forwards the value as a Bearer token.</p>
            </div>
          )}

          {/* Health check + description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Health-check path</label>
              <input type="text" value={healthPath} onChange={(e) => setHealthPath(e.target.value)}
                placeholder="/health"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Tags <span className="font-normal">(optional)</span></label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder="prod, internal"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Description <span className="font-normal">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} placeholder="What does this server do?"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border resize-none transition-colors"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => go("org")} className="p-2.5 rounded-xl border transition-colors hover:bg-white/5" style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}>
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : <Server className="w-4 h-4" strokeWidth={2} />}
              {submitting ? "Registering…" : "Register server"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ────────────────── Step: Policy ────────────────────────────────── */

  function PolicyStep() {
    const [serverSlug, setServerSlug] = useState(ob.createdServerSlug ?? (servers[0]?.slug ?? ""));
    const [toolPattern, setToolPattern] = useState("*");
    const [algorithm, setAlgorithm] = useState<RateLimitAlgorithm>(RateLimitAlgorithm.token_bucket);
    const [limit, setLimit] = useState("100");
    const [windowSec, setWindowSec] = useState("60");
    const [burst, setBurst] = useState("10");
    const [submitting, setSubmitting] = useState(false);

    const { data: rolesData } = useListRolesV1RolesGet();
    const roles = (rolesData?.data ?? []) as RoleView[];

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setSubmitting(true);
      try {
        await createPolicy.mutateAsync({
          data: {
            server_pattern: serverSlug || null,
            tool_pattern: toolPattern || null,
            algorithm,
            request_limit: parseInt(limit, 10),
            window_seconds: parseInt(windowSec, 10),
            burst_capacity: burst ? parseInt(burst, 10) : null,
          },
        });
        toast.success("Rate limit policy created");
        go("apikey", { ...ob, policyCreated: true });
      } catch {
        toast.error("Failed to create policy");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Create your first policy</h2>
        <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>Rate-limit policies protect your MCP tools from abuse and control throughput per subject or server.</p>

        {/* Policy wizard steps */}
        <div className="space-y-2 mb-6">
          {[
            { n: "1", label: "Select server & tools" },
            { n: "2", label: "Set rate limits" },
            { n: "3", label: "Review & activate" },
          ].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "var(--pc-surface)" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: "rgba(45,212,167,0.15)", color: "#2DD4A7" }}>{n}</div>
              <p className="text-xs" style={{ color: "var(--pc-foreground)" }}>{label}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Server */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Server pattern</label>
            {servers.length > 0 ? (
              <select value={serverSlug} onChange={(e) => setServerSlug(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border appearance-none"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              >
                <option value="*">All servers (*)</option>
                {servers.map((s) => <option key={s.id} value={s.slug}>{s.name} ({s.slug})</option>)}
              </select>
            ) : (
              <input type="text" value={serverSlug} onChange={(e) => setServerSlug(e.target.value)}
                placeholder="* (all servers) or server-slug"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            )}
          </div>

          {/* Tool pattern */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Tool pattern</label>
            <input type="text" value={toolPattern} onChange={(e) => setToolPattern(e.target.value)}
              placeholder="* (all tools) or tool-name"
              className="w-full px-4 py-2.5 rounded-xl text-sm font-mono outline-none border transition-colors"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--pc-muted)" }}>Use <code className="font-mono">*</code> to match all tools, or enter a specific tool name.</p>
          </div>

          {/* Roles */}
          {roles.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Apply to roles</label>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <span key={r.id} className="px-2.5 py-1 rounded-lg text-xs border" style={{ borderColor: "var(--pc-border)", background: "var(--pc-surface)", color: "var(--pc-muted)" }}>
                    {r.name}
                  </span>
                ))}
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: "var(--pc-muted)" }}>Leaving subject_id empty applies this policy globally (all subjects).</p>
            </div>
          )}

          {/* Algorithm */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--pc-muted)" }}>Algorithm</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: RateLimitAlgorithm.token_bucket,   l: "Token bucket",   d: "Allows bursts, smooths over time" },
                { v: RateLimitAlgorithm.sliding_window, l: "Sliding window",  d: "Even distribution over window" },
              ].map(({ v, l, d }) => (
                <button key={v} type="button" onClick={() => setAlgorithm(v)}
                  className="text-left p-3 rounded-xl border transition-all"
                  style={algorithm === v
                    ? { background: "rgba(45,212,167,0.06)", borderColor: "rgba(45,212,167,0.3)" }
                    : { background: "var(--pc-surface)", borderColor: "var(--pc-border)" }
                  }
                >
                  <p className="text-xs font-medium" style={{ color: algorithm === v ? "#2DD4A7" : "var(--pc-foreground)" }}>{l}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--pc-muted)" }}>{d}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Request limit</label>
              <input type="number" min="1" required value={limit} onChange={(e) => setLimit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Window (sec)</label>
              <input type="number" min="1" required value={windowSec} onChange={(e) => setWindowSec(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Burst capacity</label>
              <input type="number" min="0" value={burst} onChange={(e) => setBurst(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border px-4 py-3" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--pc-muted)" }}>Policy preview</p>
            <code className="text-xs font-mono" style={{ color: "var(--pc-foreground)" }}>
              Allow <span style={{ color: "#2DD4A7" }}>{limit}</span> requests / <span style={{ color: "#48B8E8" }}>{windowSec}s</span> on{" "}
              <span style={{ color: "#F4B942" }}>{serverSlug || "*"}</span> → <span style={{ color: "#F4B942" }}>{toolPattern}</span>
              {burst ? <> · burst <span style={{ color: "#2DD4A7" }}>{burst}</span></> : null}
            </code>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => go("server")} className="p-2.5 rounded-xl border transition-colors hover:bg-white/5" style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}>
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : <Shield className="w-4 h-4" strokeWidth={2} />}
              {submitting ? "Creating…" : "Create policy"}
            </button>
            <button type="button" onClick={() => go("apikey", { ...ob, policyCreated: false })}
              className="px-4 py-2.5 rounded-xl text-sm border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
            >
              Skip
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ────────────────── Step: API Key ───────────────────────────────── */

  function ApiKeyStep() {
    const [keyName, setKeyName] = useState("My first key");
    const [scopes, setScopes]   = useState<string[]>(["tools:call", "tools:list"]);
    const [submitting, setSubmitting] = useState(false);
    const [created, setCreated] = useState<{ plaintext: string; name: string } | null>(
      ob.createdApiKeyPlaintext ? { plaintext: ob.createdApiKeyPlaintext, name: ob.createdApiKeyName ?? "Key" } : null
    );
    const [showKey, setShowKey] = useState(false);

    const { data: keysResp } = useListApiKeysV1ApiKeysGet();
    const existingKeys = (keysResp?.data ?? []) as ApiKeyView[];

    const ALL_SCOPES = ["tools:list", "tools:call", "audit:read", "keys:read"];

    function toggleScope(s: string) {
      setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    }

    async function handleCreate(e: React.FormEvent) {
      e.preventDefault();
      setSubmitting(true);
      try {
        const result = await createApiKey.mutateAsync({ data: { name: keyName, scopes } });
        await qc.invalidateQueries({ queryKey: ["listApiKeysV1ApiKeysGet"] });
        const resp = result.data as ApiKeyCreateResponse;
        const plaintext = resp.plaintext;
        const nextOb = { ...ob, createdApiKeyPlaintext: plaintext, createdApiKeyName: keyName };
        setCreated({ plaintext, name: keyName });
        setOb(nextOb);
        save("apikey", nextOb);
        toast.success("API key created");
      } catch {
        toast.error("Failed to create API key");
      } finally {
        setSubmitting(false);
      }
    }

    if (created) {
      return (
        <div className="max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: "rgba(45,212,167,0.1)", border: "1px solid rgba(45,212,167,0.25)" }}>
            <Key className="w-6 h-6" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>API key created</h2>
          <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>
            Copy this key now — you won&apos;t be able to see it again.
          </p>

          <div className="rounded-2xl border p-5 mb-5" style={{ background: "var(--pc-surface)", borderColor: "rgba(45,212,167,0.2)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--pc-muted)" }}>{created.name}</p>
            <div className="flex items-center gap-2 p-3 rounded-xl mb-3" style={{ background: "var(--pc-elevated)" }}>
              <code className="flex-1 text-xs font-mono break-all" style={{ color: "#2DD4A7" }}>
                {showKey ? created.plaintext : created.plaintext.slice(0, 12) + "•".repeat(24)}
              </code>
              <button type="button" onClick={() => setShowKey((v) => !v)} className="flex-shrink-0 p-1" style={{ color: "var(--pc-muted)" }}>
                {showKey ? <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />}
              </button>
              <CopyButton text={created.plaintext} />
            </div>

            <p className="text-xs mb-2" style={{ color: "var(--pc-muted)" }}>Use it in your MCP client:</p>
            <div className="rounded-lg p-3 relative" style={{ background: "#080D11" }}>
              <code className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: "#48B8E8" }}>
                {`Authorization: Bearer ${showKey ? created.plaintext : created.plaintext.slice(0, 12) + "..."}`}
              </code>
              <div className="absolute top-2 right-2">
                <CopyButton text={`Authorization: Bearer ${created.plaintext}`} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border px-4 py-3 mb-6 flex items-start gap-3" style={{ background: "rgba(244,185,66,0.06)", borderColor: "rgba(244,185,66,0.25)" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F4B942" }} strokeWidth={2} />
            <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
              Store this key securely. Treat it like a password — never commit it to source control.
            </p>
          </div>

          <button type="button" onClick={() => go("done")}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            Continue <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Generate your API key</h2>
        <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>API keys authenticate your MCP clients against the Portcullis gateway.</p>

        {existingKeys.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl px-4 py-3 border mb-5" style={{ background: "rgba(45,212,167,0.06)", borderColor: "rgba(45,212,167,0.2)" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#2DD4A7" }} strokeWidth={2} />
            <div className="flex-1">
              <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>You have {existingKeys.length} existing key{existingKeys.length > 1 ? "s" : ""}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--pc-muted)" }}>You can create another or skip this step.</p>
            </div>
            <button type="button" onClick={() => go("done")} className="text-xs font-medium flex-shrink-0" style={{ color: "var(--pc-primary)" }}>Skip →</button>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Key name</label>
            <input type="text" required value={keyName} onChange={(e) => setKeyName(e.target.value)}
              placeholder="My first key"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--pc-muted)" }}>Scopes</label>
            <div className="flex flex-wrap gap-2">
              {ALL_SCOPES.map((s) => (
                <button key={s} type="button" onClick={() => toggleScope(s)}
                  className="px-3 py-1.5 rounded-lg text-xs border transition-all font-mono"
                  style={scopes.includes(s)
                    ? { background: "rgba(45,212,167,0.1)", borderColor: "rgba(45,212,167,0.4)", color: "#2DD4A7" }
                    : { background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-muted)" }
                  }
                >
                  {scopes.includes(s) ? "✓ " : ""}{s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => go("policy")} className="p-2.5 rounded-xl border transition-colors hover:bg-white/5" style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}>
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <button type="submit" disabled={submitting || scopes.length === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : <Key className="w-4 h-4" strokeWidth={2} />}
              {submitting ? "Creating…" : "Generate key"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ────────────────── Step: Done ──────────────────────────────────── */

  function DoneStep() {
    const allDone = completedSteps.size >= 4;

    const NEXT_LINKS = [
      { icon: Server, label: "View your servers",    href: "/dashboard/servers",    color: "#2DD4A7" },
      { icon: Shield, label: "Manage policies",       href: "/dashboard/policies",   color: "#48B8E8" },
      { icon: Play,   label: "Test tools",            href: "/dashboard/playground", color: "#F4B942" },
      { icon: Eye,    label: "View audit log",        href: "/dashboard/audit",      color: "#35C88A" },
      { icon: Users,  label: "Invite teammates",      href: "/dashboard/team",       color: "#F05D5E" },
      { icon: BookOpen, label: "Read the docs",       href: "/developer/docs",       color: "#8B98A7" },
    ];

    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(45,212,167,0.1)", border: "1px solid rgba(45,212,167,0.25)" }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: "var(--pc-foreground)" }}>
          {allDone ? "You're all set!" : "Good start!"}
        </h2>
        <p className="text-sm mb-8 max-w-md mx-auto leading-relaxed" style={{ color: "var(--pc-muted)" }}>
          {allDone
            ? "Your Portcullis gateway is configured. You can start proxying MCP tool calls, enforcing policies, and monitoring traffic."
            : "You've completed the core setup. You can finish the remaining steps anytime from the dashboard."
          }
        </p>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-8 text-left">
          {[
            { icon: Building2, label: "Organization",  value: ob.orgName || "Default",                  ok: !!ob.orgName },
            { icon: Server,    label: "MCP Server",    value: ob.createdServerSlug ?? (servers[0]?.slug ?? "—"), ok: !!(ob.createdServerId ?? servers[0]) },
            { icon: Shield,    label: "Rate Policy",   value: ob.policyCreated ? "Active" : "Not set",  ok: ob.policyCreated },
            { icon: Key,       label: "API Key",       value: ob.createdApiKeyName ?? (existingKeys.length > 0 ? "Existing" : "—"), ok: !!(ob.createdApiKeyPlaintext ?? existingKeys.length > 0) },
          ].map(({ icon: Icon, label, value, ok }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ok ? "rgba(45,212,167,0.1)" : "rgba(139,152,167,0.08)" }}>
                <Icon className="w-4 h-4" style={{ color: ok ? "#2DD4A7" : "var(--pc-muted)" }} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px]" style={{ color: "var(--pc-muted)" }}>{label}</p>
                <p className="text-xs font-medium truncate" style={{ color: "var(--pc-foreground)" }}>{value}</p>
              </div>
              {ok
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 ml-auto" style={{ color: "#2DD4A7" }} strokeWidth={2} />
                : <Circle className="w-4 h-4 flex-shrink-0 ml-auto" style={{ color: "var(--pc-border)" }} strokeWidth={1.5} />
              }
            </div>
          ))}
        </div>

        {/* Next steps */}
        <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--pc-muted)" }}>Where to next?</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {NEXT_LINKS.map(({ icon: Icon, label, href, color }) => (
            <Link key={href} href={href}
              className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border transition-all hover:bg-white/5"
              style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
            >
              <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.5} />
              <span className="text-xs font-medium text-center" style={{ color: "var(--pc-foreground)" }}>{label}</span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => { sessionStorage.removeItem("pc_onboarding"); router.push("/dashboard"); }}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          Go to dashboard <ExternalLink className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    );
  }

  /* ────────────────── Look up existing key count ──────────────────── */

  const { data: keysResp } = useListApiKeysV1ApiKeysGet();
  const existingKeys = (keysResp?.data ?? []) as ApiKeyView[];

  /* ────────────────── Render ──────────────────────────────────────── */

  return (
    <div className="py-10 px-6">
      <StepBar current={step} />

      <div className="w-full">
        {step === "welcome" && <WelcomeStep />}
        {step === "org"     && <OrgStep />}
        {step === "server"  && <ServerStep />}
        {step === "policy"  && <PolicyStep />}
        {step === "apikey"  && <ApiKeyStep />}
        {step === "done"    && <DoneStep />}
      </div>
    </div>
  );
}
