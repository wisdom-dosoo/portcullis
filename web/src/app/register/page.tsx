"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye, EyeOff, GitFork, AlertTriangle, CheckCircle2, ChevronRight,
  Building2, User, Mail, Lock, Briefcase, Users, UserPlus,
} from "lucide-react";

/* ── Portcullis grille (shared visual) ───────────────────────────── */

function PortcullisGrille() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
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
                  width: size, height: size,
                  top: row * 36 + 4, left: col * 36 + 4,
                  background: "#2DD4A7",
                  animation: `pulse-dot ${2 + delay}s ease-in-out ${delay}s infinite`,
                }}
              />
            );
          })
        )}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={`vbar-${i}`} className="absolute rounded-full" style={{
            width: 2, height: 360, top: 4, left: i * 72 + 19,
            background: "linear-gradient(180deg, transparent, rgba(45,212,167,0.15), rgba(45,212,167,0.3), rgba(45,212,167,0.15), transparent)",
            animation: `float-up ${3 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`,
          }} />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={`hbar-${i}`} className="absolute rounded-full" style={{
            height: 2, width: 360, left: 4, top: i * 72 + 19,
            background: "linear-gradient(90deg, transparent, rgba(45,212,167,0.15), rgba(45,212,167,0.25), rgba(45,212,167,0.15), transparent)",
          }} />
        ))}
      </div>
      <div className="absolute flex items-center justify-center" style={{
        width: 72, height: 72,
        background: "rgba(45,212,167,0.08)",
        border: "1px solid rgba(45,212,167,0.25)",
        borderRadius: 16,
        animation: "float-up 4s ease-in-out infinite",
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4"  y="4"  width="4" height="24" rx="1" fill="#2DD4A7" opacity="0.8" />
          <rect x="14" y="4"  width="4" height="24" rx="1" fill="#2DD4A7" opacity="0.8" />
          <rect x="24" y="4"  width="4" height="24" rx="1" fill="#2DD4A7" opacity="0.8" />
          <rect x="4"  y="4"  width="24" height="4"  rx="1" fill="#2DD4A7" opacity="0.6" />
          <rect x="4"  y="14" width="24" height="3"  rx="1" fill="#2DD4A7" opacity="0.4" />
          <path d="M8 28 Q8 32 12 32 L20 32 Q24 32 24 28" stroke="#2DD4A7" strokeWidth="2" fill="none" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

/* ── Password strength ───────────────────────────────────────────── */

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak",   color: "#F05D5E" };
  if (score <= 2) return { score, label: "Fair",   color: "#F4B942" };
  if (score <= 3) return { score, label: "Good",   color: "#48B8E8" };
  return              { score, label: "Strong", color: "#35C88A" };
}

/* ── Flow type selector ──────────────────────────────────────────── */

type Flow = "create" | "join" | "invitation";

const FLOWS: { id: Flow; icon: React.ElementType; label: string; sublabel: string }[] = [
  { id: "create",     icon: Building2, label: "Create organization",    sublabel: "Start a new Portcullis workspace" },
  { id: "join",       icon: Users,     label: "Join existing org",      sublabel: "Request access to an organization" },
  { id: "invitation", icon: UserPlus,  label: "Accept invitation",      sublabel: "You received an invite link" },
];

const INTENDED_USES = [
  "AI/ML infrastructure",
  "Developer tooling",
  "Security & compliance",
  "Product integration",
  "Internal tooling",
  "Research / academic",
  "Other",
];

/* ── Main page ───────────────────────────────────────────────────── */

export default function RegisterPage() {
  const [flow, setFlow]             = useState<Flow>("create");
  const [fullName, setFullName]     = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [orgName, setOrgName]       = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [terms, setTerms]           = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  const strength = passwordStrength(password);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--pc-bg)" }}>
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(45,212,167,0.1)", border: "1px solid rgba(45,212,167,0.25)" }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--pc-foreground)" }}>Check your email</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--pc-muted)" }}>
            We sent a verification link to <strong style={{ color: "var(--pc-foreground)" }}>{email}</strong>.
            Open the link to activate your account.
          </p>
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            Didn&apos;t get it?{" "}
            <button className="underline" style={{ color: "var(--pc-primary)" }} onClick={() => setSubmitted(false)}>
              Resend email
            </button>
          </p>
          <div className="mt-8">
            <Link href="/login" className="text-sm font-medium" style={{ color: "var(--pc-primary)" }}>
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--pc-bg)" }}>

      {/* ── Left: form ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--pc-primary)" }}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                <rect x="4"  y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
                <rect x="14" y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
                <rect x="24" y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
                <rect x="4"  y="4"  width="24" height="4"  rx="1" fill="#0C1116" opacity="0.7" />
                <rect x="4"  y="14" width="24" height="3"  rx="1" fill="#0C1116" opacity="0.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold leading-none" style={{ color: "var(--pc-foreground)" }}>Portcullis</p>
              <p className="text-[10px] font-mono" style={{ color: "var(--pc-muted)" }}>MCP Gateway</p>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Create your account</h1>
          <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium" style={{ color: "var(--pc-primary)" }}>Sign in</Link>
          </p>

          {/* GitHub OAuth */}
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-4"
            style={{ borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
            title="OAuth not configured — contact your administrator"
          >
            <GitFork className="w-4 h-4" strokeWidth={1.5} />
            Continue with GitHub
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: "var(--pc-border)" }} />
            <span className="text-xs" style={{ color: "var(--pc-muted)" }}>or register with email</span>
            <div className="flex-1 h-px" style={{ background: "var(--pc-border)" }} />
          </div>

          {/* Flow selector */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {FLOWS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFlow(id)}
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all"
                style={flow === id
                  ? { background: "rgba(45,212,167,0.08)", borderColor: "rgba(45,212,167,0.4)", color: "#2DD4A7" }
                  : { background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-muted)" }
                }
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-tight">{label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Full name */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                  style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                />
              </div>
            </div>

            {/* Work email */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Work email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                  style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                  style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--pc-muted)" }}>
                  {showPw ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="flex-1 h-1 rounded-full transition-all" style={{ background: i < strength.score ? strength.color : "var(--pc-border)" }} />
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: strength.color }}>{strength.label}</p>
                </div>
              )}
            </div>

            {/* Flow-specific fields */}
            {flow === "create" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Organization name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                    style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                  />
                </div>
              </div>
            )}

            {flow === "join" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Organization name or domain</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="acme-corp or @acme.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                    style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                  />
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: "var(--pc-muted)" }}>An org admin will need to approve your request.</p>
              </div>
            )}

            {flow === "invitation" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Invitation code</label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-colors font-mono tracking-widest"
                  style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                />
              </div>
            )}

            {/* Intended use */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Intended use</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                <select
                  required
                  value={intendedUse}
                  onChange={(e) => setIntendedUse(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border appearance-none transition-colors"
                  style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: intendedUse ? "var(--pc-foreground)" : "var(--pc-muted)" }}
                >
                  <option value="" disabled>Select a use case…</option>
                  {INTENDED_USES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                  style={terms
                    ? { background: "var(--pc-primary)", borderColor: "var(--pc-primary)" }
                    : { background: "var(--pc-surface)", borderColor: "var(--pc-border)" }
                  }
                >
                  {terms && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0C1116" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              </div>
              <span className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                I agree to the{" "}
                <Link href="#" className="underline" style={{ color: "var(--pc-primary)" }}>Terms of Service</Link>
                {" "}and{" "}
                <Link href="#" className="underline" style={{ color: "var(--pc-primary)" }}>Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={!terms}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              {flow === "create"     ? "Create account & organization" :
               flow === "join"       ? "Request access" :
                                       "Accept invitation"}
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </form>

          <p className="text-xs text-center mt-6" style={{ color: "var(--pc-muted)" }}>
            Protected by Portcullis security.{" "}
            <Link href="#" className="underline" style={{ color: "var(--pc-primary)" }}>Privacy notice</Link>
          </p>
        </div>
      </div>

      {/* ── Right: grille visualization ─────────────────────────── */}
      <div
        className="hidden lg:flex flex-1 relative overflow-hidden"
        style={{ background: "#080D11" }}
      >
        <PortcullisGrille />
        <div className="absolute bottom-10 left-0 right-0 text-center px-10">
          <p className="text-sm font-medium mb-1" style={{ color: "rgba(241,245,249,0.7)" }}>
            Zero-trust access for every MCP tool
          </p>
          <p className="text-xs" style={{ color: "rgba(139,152,167,0.6)" }}>
            Portcullis enforces policy, logs every call, and keeps your infrastructure secure.
          </p>
        </div>
      </div>
    </div>
  );
}
