"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2, Wifi, WifiOff, Mail, Lock } from "lucide-react";
import { setToken } from "@/lib/auth";
import { axiosClient } from "@/lib/axios-instance";
import { Suspense } from "react";

/* ── Portcullis grille SVG ───────────────────────────────────────── */

function PortcullisGrille() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Animated scan line */}
      <div
        className="absolute inset-x-0 h-px pointer-events-none z-10"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(45,212,167,0.6), transparent)",
          animation: "scan 4s linear infinite",
          top: "0",
        }}
      />
      <style>{`
        @keyframes scan {
          0%   { top: 0%; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.6; }
        }
        @keyframes float-up {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-8px); }
          100% { transform: translateY(0px); }
        }
      `}</style>

      {/* Grid dots */}
      <div className="relative">
        {Array.from({ length: 12 }, (_, row) =>
          Array.from({ length: 10 }, (_, col) => {
            const delay = ((row * 10 + col) * 0.08) % 3;
            const size = (row + col) % 3 === 0 ? 3 : 2;
            return (
              <div
                key={`${row}-${col}`}
                className="absolute rounded-full"
                style={{
                  width: size,
                  height: size,
                  top: row * 36 + 4,
                  left: col * 36 + 4,
                  background: "#2DD4A7",
                  animation: `pulse-dot ${2 + delay}s ease-in-out ${delay}s infinite`,
                }}
              />
            );
          })
        )}

        {/* Vertical bars */}
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={`vbar-${i}`}
            className="absolute rounded-full"
            style={{
              width: 2,
              height: 360,
              top: 4,
              left: i * 72 + 19,
              background: "linear-gradient(180deg, transparent, rgba(45,212,167,0.15), rgba(45,212,167,0.3), rgba(45,212,167,0.15), transparent)",
              animation: `float-up ${3 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`,
            }}
          />
        ))}

        {/* Horizontal bars */}
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={`hbar-${i}`}
            className="absolute rounded-full"
            style={{
              height: 2,
              width: 360,
              left: 4,
              top: i * 72 + 19,
              background: "linear-gradient(90deg, transparent, rgba(45,212,167,0.15), rgba(45,212,167,0.25), rgba(45,212,167,0.15), transparent)",
            }}
          />
        ))}
      </div>

      {/* Center glyph */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          width: 72,
          height: 72,
          background: "rgba(45,212,167,0.08)",
          border: "1px solid rgba(45,212,167,0.25)",
          borderRadius: 16,
          animation: "float-up 4s ease-in-out infinite",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          {/* Portcullis gate shape */}
          <rect x="4"  y="4"  width="4" height="24" rx="1" fill="#2DD4A7" opacity="0.8" />
          <rect x="14" y="4"  width="4" height="24" rx="1" fill="#2DD4A7" opacity="0.8" />
          <rect x="24" y="4"  width="4" height="24" rx="1" fill="#2DD4A7" opacity="0.8" />
          <rect x="4"  y="4"  width="24" height="4"  rx="1" fill="#2DD4A7" opacity="0.6" />
          <rect x="4"  y="14" width="24" height="3"  rx="1" fill="#2DD4A7" opacity="0.4" />
          {/* Bottom arch */}
          <path d="M8 28 Q8 32 12 32 L20 32 Q24 32 24 28" stroke="#2DD4A7" strokeWidth="2" fill="none" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

/* ── Status indicator ────────────────────────────────────────────── */

function ServiceStatus({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color: ok ? "#35C88A" : "#F05D5E" }}>
      {ok
        ? <><Wifi className="w-3 h-3" strokeWidth={2} /> <span>Service operational</span></>
        : <><WifiOff className="w-3 h-3" strokeWidth={2} /> <span>Service unavailable</span></>}
    </div>
  );
}

/* ── Error banner ────────────────────────────────────────────────── */

type AuthError =
  | "invalid_credentials"
  | "too_many_attempts"
  | "pending_approval"
  | "rejected"
  | "service_unavailable"
  | "session_expired"
  | null;

const ERROR_MESSAGES: Record<NonNullable<AuthError>, { title: string; detail: string }> = {
  invalid_credentials: {
    title: "Invalid API key",
    detail: "The key you entered was not recognised. Check it and try again.",
  },
  too_many_attempts: {
    title: "Too many attempts",
    detail: "Your access has been temporarily locked. Try again in a few minutes.",
  },
  pending_approval: {
    title: "Account pending approval",
    detail: "Your request to join an organization is still being reviewed. Please check back later.",
  },
  rejected: {
    title: "Access denied",
    detail: "Your account has not been approved. Contact an organization admin for help.",
  },
  service_unavailable: {
    title: "Service unavailable",
    detail: "Portcullis cannot be reached right now. Check your network or server status.",
  },
  session_expired: {
    title: "Session expired",
    detail: "Your session has timed out. Please sign in again.",
  },
};

function ErrorBanner({ error }: { error: AuthError }) {
  if (!error) return null;
  const msg = ERROR_MESSAGES[error];
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3 border"
      style={{ background: "rgba(240,93,94,0.08)", borderColor: "rgba(240,93,94,0.3)" }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F05D5E" }} strokeWidth={2} />
      <div>
        <p className="text-sm font-semibold" style={{ color: "#F05D5E" }}>{msg.title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--pc-muted)" }}>{msg.detail}</p>
      </div>
    </div>
  );
}

/* ── SSO button ──────────────────────────────────────────────────── */

const SSO_SLUG = process.env.NEXT_PUBLIC_SSO_SLUG ?? "sso";

function SsoButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  return (
    <a
      href={`${apiBase}/auth/sso/${SSO_SLUG}/login`}
      className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
      aria-label={`Continue with ${label}`}
    >
      {icon}
      {label}
    </a>
  );
}

/* ── Main form (needs Suspense for useSearchParams) ──────────────── */

function SignInForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [apiKey, setApiKey]     = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [authError, setAuthError] = useState<AuthError>(
    () => (searchParams.get("reason") === "expired" ? "session_expired" : null)
  );
  const [serviceOk, setServiceOk] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState(0);

  // Passive health check
  useEffect(() => {
    axiosClient.get("/healthz")
      .then(() => setServiceOk(true))
      .catch(() => setServiceOk(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attempts >= 5) { setAuthError("too_many_attempts"); return; }
    setAuthError(null);
    setLoading(true);
    try {
      const trimmedApiKey = apiKey.trim();
      const trimmedEmail = email.trim();

      if (trimmedApiKey) {
        await axiosClient.get("/auth/me", {
          headers: { Authorization: `Bearer ${trimmedApiKey}` },
        });
        setToken(trimmedApiKey);
      } else {
        const response = await axiosClient.post("/auth/login", {
          email: trimmedEmail,
          password,
        });
        const token = response.data?.access_token ?? response.data?.token;
        if (!token) throw new Error("missing_token");
        setToken(token);
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      setAttempts((n) => n + 1);
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (!status) {
        setAuthError("service_unavailable");
      } else if (status === 403 && detail?.includes("pending approval")) {
        setAuthError("pending_approval");
      } else if (status === 403 && detail?.includes("denied")) {
        setAuthError("rejected");
      } else {
        setAuthError("invalid_credentials");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <ErrorBanner error={authError} />

      {/* API key field */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
          API Key
        </label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setAuthError(null); }}
            placeholder="pk_live_••••••••••••••••"
            autoComplete="current-password"
            className="w-full px-3.5 py-2 pr-11 rounded-xl border text-sm font-mono outline-none transition-colors"
            style={{
              background: "var(--pc-elevated)",
              borderColor: authError ? "rgba(240,93,94,0.5)" : "var(--pc-border)",
              color: "var(--pc-foreground)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(45,212,167,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = authError ? "rgba(240,93,94,0.5)" : "var(--pc-border)")}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: "var(--pc-muted)" }}
          >
            {show ? <EyeOff className="w-4 h-4" strokeWidth={1.75} /> : <Eye className="w-4 h-4" strokeWidth={1.75} />}
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
          Create a key with{" "}
          <code
            className="px-1 py-0.5 rounded text-[10px]"
            style={{ background: "var(--pc-elevated)", color: "var(--pc-secondary)" }}
          >
            python -m app.cli admin-key create
          </code>
        </p>
      </div>

      {/* Email and password fields */}
      <div className="grid gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--pc-muted)" }}>
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
              placeholder="jane@company.com"
              autoComplete="email"
              className="w-full pl-10 pr-3.5 py-2 rounded-xl border text-sm outline-none transition-colors"
              style={{
                background: "var(--pc-elevated)",
                borderColor: authError ? "rgba(240,93,94,0.5)" : "var(--pc-border)",
                color: "var(--pc-foreground)",
              }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--pc-muted)" }}>
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full pl-10 pr-11 py-2 rounded-xl border text-sm outline-none transition-colors"
              style={{
                background: "var(--pc-elevated)",
                borderColor: authError ? "rgba(240,93,94,0.5)" : "var(--pc-border)",
                color: "var(--pc-foreground)",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: "var(--pc-muted)" }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" strokeWidth={1.75} /> : <Eye className="w-4 h-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </div>

      {/* Remember + forgot */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            className="relative w-4 h-4 rounded border flex items-center justify-center transition-colors"
            style={{
              background: remember ? "var(--pc-primary)" : "transparent",
              borderColor: remember ? "var(--pc-primary)" : "var(--pc-border)",
            }}
            onClick={() => setRemember(!remember)}
          >
            {remember && <CheckCircle2 className="w-3 h-3" style={{ color: "#0C1116" }} strokeWidth={3} />}
          </div>
          <span className="text-xs" style={{ color: "var(--pc-muted)" }}>Remember this device</span>
        </label>
        <Link href="/auth/forgot-password" className="text-xs transition-colors" style={{ color: "var(--pc-primary)" }}>
          Forgot key?
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || attempts >= 5 || (!apiKey.trim() && (!email.trim() || !password))}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--pc-primary)", color: "#0C1116" }}
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
          : "Sign in to Portcullis"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "var(--pc-border)" }} />
        <span className="text-xs" style={{ color: "var(--pc-muted)" }}>or continue with</span>
        <div className="flex-1 h-px" style={{ background: "var(--pc-border)" }} />
      </div>

      {/* SSO button */}
      <div className="grid grid-cols-1 gap-2">
        <SsoButton
          label="Single sign-on"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <ServiceStatus ok={serviceOk} />
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--pc-muted)" }}>
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
        </div>
      </div>
    </form>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function LoginPage() {
  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row overflow-hidden" style={{ background: "var(--pc-bg)" }}>

      {/* ── Left panel — form ─────────────────────────────────────── */}
      <div className="flex flex-col justify-start lg:justify-center w-full lg:w-[480px] xl:w-[520px] flex-shrink-0 px-6 py-6 sm:px-8 lg:px-14 lg:h-screen lg:overflow-y-auto">

        {/* Logo */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--pc-primary)" }}
            >
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <rect x="4"  y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
                <rect x="14" y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
                <rect x="24" y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
                <rect x="4"  y="4"  width="24" height="4"  rx="1" fill="#0C1116" opacity="0.7" />
                <rect x="4"  y="14" width="24" height="3"  rx="1" fill="#0C1116" opacity="0.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold leading-none" style={{ color: "var(--pc-foreground)" }}>Portcullis</p>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--pc-muted)" }}>MCP Gateway</p>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>
            Sign in to your gateway
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--pc-muted)" }}>
            Authenticate with your API key or an identity provider
          </p>
        </div>

        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--pc-muted)" }}>
          New to Portcullis?{" "}
          <Link href="/register" className="font-medium" style={{ color: "var(--pc-primary)" }}>
            Create an account
          </Link>
        </p>
      </div>

      {/* ── Right panel — grille visualization ───────────────────── */}
      <div
        className="hidden lg:flex flex-1 relative flex-col items-center justify-center overflow-hidden"
        style={{ background: "#080D11" }}
      >
        {/* Background radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(45,212,167,0.07) 0%, transparent 70%)",
          }}
        />

        {/* Grille */}
        <div className="relative z-10" style={{ width: 380, height: 380 }}>
          <PortcullisGrille />
        </div>

        {/* Security statement */}
        <div className="relative z-10 mt-10 max-w-sm text-center px-8">
          <p
            className="text-lg font-semibold leading-snug"
            style={{ color: "var(--pc-foreground)" }}
          >
            Every tool call, verified.
          </p>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Portcullis enforces access policies, rate limits, and audit trails across all your MCP servers — so you always know who did what.
          </p>
        </div>

        {/* Trust badges */}
        <div className="relative z-10 mt-8 flex items-center gap-6">
          {[
            { label: "Policy enforcement", color: "#2DD4A7" },
            { label: "Full audit trail",   color: "#48B8E8" },
            { label: "Rate limiting",      color: "#F4B942" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <span className="text-xs" style={{ color: "var(--pc-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
