"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Eye, EyeOff, Loader2, Wifi, WifiOff, AlertTriangle, CheckCircle2, Mail, Lock } from "lucide-react";
import { markCookieSession } from "@/lib/auth";
import { axiosClient } from "@/lib/axios-instance";

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#2DD4A7",
    colorBackground: "#0C1116",
    colorInputBackground: "#111A22",
    colorText: "#F1F5F9",
    colorTextSecondary: "#8B98A7",
    colorInputText: "#F1F5F9",
    borderRadius: "0.75rem",
  },
} as const;

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
    title: "Invalid credentials",
    detail: "The email or password you entered was not recognised. Check them and try again.",
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

/* ── Continue with Google (backend OIDC, no Clerk key needed) ───── */

const GOOGLE_SSO_SLUG = process.env.NEXT_PUBLIC_SSO_SLUG ?? "google";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function GoogleButton() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  return (
    <a
      href={`${apiBase}/auth/sso/${GOOGLE_SSO_SLUG}/login`}
      className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: "#dadce0", background: "#ffffff", color: "#1f1f1f" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6fafe")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
      aria-label="Continue with Google"
    >
      <GoogleIcon />
      Continue with Google
    </a>
  );
}

/* ── Legacy email sign-in (no Clerk key configured) ──────────────── */

function LegacySignInForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [authError, setAuthError] = useState<AuthError>(
    () => (searchParams.get("reason") === "expired" ? "session_expired" : null)
  );
  const [attempts, setAttempts] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const stored = Number(sessionStorage.getItem("pc_login_attempts") ?? attempts);
    if (stored >= 5) { setAuthError("too_many_attempts"); return; }
    setAuthError(null);
    setLoading(true);
    try {
      const response = await axiosClient.post("/auth/login", {
        email: email.trim(),
        password,
      });
      const token = response.data?.access_token ?? response.data?.token;
      if (!token) throw new Error("missing_token");
      // Email login: backend also sets HttpOnly `portcullis_auth`.
      // Prefer the cookie session — keep no JS credential.
      markCookieSession(remember);
      router.push("/dashboard");
    } catch (err: unknown) {
      const next = attempts + 1;
      setAttempts(next);
      try {
        sessionStorage.setItem("pc_login_attempts", String(next));
      } catch {
        /* ignore */
      }
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
    <div className="space-y-3.5">
      {/* Continue with Google — primary */}
      <GoogleButton />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "var(--pc-border)" }} />
        <span className="text-xs" style={{ color: "var(--pc-muted)" }}>or sign in with email</span>
        <div className="flex-1 h-px" style={{ background: "var(--pc-border)" }} />
      </div>

    <form onSubmit={handleSubmit} className="space-y-3.5">
      <ErrorBanner error={authError} />

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
        <Link
          href="/auth/forgot-password"
          className="text-xs hover:underline"
          style={{ color: "var(--pc-muted)" }}
        >
          Forgot password?
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || attempts >= 5 || !email.trim() || !password}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--pc-primary)", color: "#0C1116" }}
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
          : "Sign in to Portcullis"}
      </button>
    </form>
    </div>
  );
}

/* ── Sign-in block (needs Suspense for useSearchParams) ──────────── */

function SignInBlock() {
  const searchParams = useSearchParams();
  const [serviceOk, setServiceOk] = useState<boolean | null>(null);

  // Passive health check
  useEffect(() => {
    axiosClient.get("/healthz")
      .then(() => setServiceOk(true))
      .catch(() => setServiceOk(false));
  }, []);

  const expired = searchParams.get("reason") === "expired";

  return (
    <div className="space-y-3.5">
      {expired && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3 border"
          style={{ background: "rgba(240,93,94,0.08)", borderColor: "rgba(240,93,94,0.3)" }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F05D5E" }} strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#F05D5E" }}>Session expired</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
              Your session has timed out. Please sign in again.
            </p>
          </div>
        </div>
      )}

      {CLERK_KEY ? (
        <div className="flex justify-center">
          <SignIn
            forceRedirectUrl="/dashboard"
            signUpUrl="/register"
            appearance={CLERK_APPEARANCE}
          />
        </div>
      ) : (
        <LegacySignInForm />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <ServiceStatus ok={serviceOk} />
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--pc-muted)" }}>
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
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
            {CLERK_KEY
              ? "Continue with Google or your email to access Portcullis"
              : "Sign in with your email to access Portcullis"}
          </p>
        </div>

        <Suspense fallback={null}>
          <SignInBlock />
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
