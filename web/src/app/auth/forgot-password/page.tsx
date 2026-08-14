"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

/* ── Portcullis grille ───────────────────────────────────────────── */

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
              <div key={`${row}-${col}`} className="absolute rounded-full" style={{
                width: size, height: size,
                top: row * 36 + 4, left: col * 36 + 4,
                background: "#2DD4A7",
                animation: `pulse-dot ${2 + delay}s ease-in-out ${delay}s infinite`,
              }} />
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

type StrengthRule = { label: string; test: (pw: string) => boolean };

const STRENGTH_RULES: StrengthRule[] = [
  { label: "At least 8 characters",         test: (pw) => pw.length >= 8 },
  { label: "At least one uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "At least one number",           test: (pw) => /[0-9]/.test(pw) },
  { label: "At least one special character",test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function strengthScore(pw: string): number {
  return STRENGTH_RULES.filter((r) => r.test(pw)).length;
}

function strengthMeta(score: number): { label: string; color: string } {
  if (score <= 1) return { label: "Weak",   color: "#F05D5E" };
  if (score <= 2) return { label: "Fair",   color: "#F4B942" };
  if (score === 3) return { label: "Good",  color: "#48B8E8" };
  return              { label: "Strong", color: "#35C88A" };
}

/* ── Flow ────────────────────────────────────────────────────────── */

type Step = "request" | "sent" | "reset" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep]             = useState<Step>("request");
  const [email, setEmail]           = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [showNew, setShowNew]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revokeOther, setRevokeOther] = useState(true);
  const [mismatch, setMismatch]     = useState(false);

  const score  = strengthScore(newPw);
  const smeta  = strengthMeta(score);

  function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setStep("sent");
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setMismatch(true); return; }
    setMismatch(false);
    setStep("success");
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden" style={{ background: "var(--pc-bg)" }}>

      {/* ── Left: form ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center px-6 py-8 lg:py-10 lg:h-screen lg:overflow-y-auto">
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

          {/* ── Step: Request ── */}
          {step === "request" && (
            <>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-xs mb-6 transition-colors hover:opacity-70" style={{ color: "var(--pc-muted)" }}>
                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Back to sign in
              </Link>

              <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Reset your password</h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                Enter your work email and we&apos;ll send you a secure reset link.
              </p>

              <form onSubmit={requestReset} className="space-y-4">
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
                      autoFocus
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--pc-primary)", color: "#0C1116" }}
                >
                  Send reset link
                </button>
              </form>
            </>
          )}

          {/* ── Step: Sent ── */}
          {step === "sent" && (
            <>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ background: "rgba(45,212,167,0.1)", border: "1px solid rgba(45,212,167,0.25)" }}>
                <Mail className="w-7 h-7" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
              </div>

              <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--pc-foreground)" }}>Check your email</h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                We sent a password reset link to{" "}
                <strong style={{ color: "var(--pc-foreground)" }}>{email}</strong>.
                The link will expire in 15 minutes.
              </p>

              <div className="rounded-xl border px-4 py-3 mb-6" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
                <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
                  Didn&apos;t receive it? Check your spam folder, or{" "}
                  <button className="underline" style={{ color: "var(--pc-primary)" }} onClick={() => setStep("request")}>
                    try another email address
                  </button>.
                </p>
              </div>

              {/* Simulate clicking reset link */}
              <button
                type="button"
                onClick={() => setStep("reset")}
                className="w-full py-2.5 rounded-xl text-sm border transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
              >
                Simulate: I clicked the reset link →
              </button>

              <p className="text-xs text-center mt-6">
                <Link href="/login" className="underline" style={{ color: "var(--pc-muted)" }}>Back to sign in</Link>
              </p>
            </>
          )}

          {/* ── Step: Reset ── */}
          {step === "reset" && (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Choose a new password</h1>
              <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>
                Pick a strong password for your account.
              </p>

              {mismatch && (
                <div className="flex items-start gap-3 rounded-xl px-4 py-3 border mb-4" style={{ background: "rgba(240,93,94,0.08)", borderColor: "rgba(240,93,94,0.3)" }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F05D5E" }} strokeWidth={2} />
                  <p className="text-sm" style={{ color: "#F05D5E" }}>Passwords do not match.</p>
                </div>
              )}

              <form onSubmit={submitReset} className="space-y-4">
                {/* New password */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>New password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                    <input
                      type={showNew ? "text" : "password"}
                      required
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="At least 8 characters"
                      autoFocus
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
                    />
                    <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--pc-muted)" }}>
                      {showNew ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>

                  {/* Strength meter */}
                  {newPw.length > 0 && (
                    <div className="mt-2.5">
                      <div className="flex gap-1 mb-2">
                        {Array.from({ length: 4 }, (_, i) => (
                          <div key={i} className="flex-1 h-1 rounded-full transition-all" style={{ background: i < score ? smeta.color : "var(--pc-border)" }} />
                        ))}
                      </div>
                      <p className="text-[10px] font-medium mb-1.5" style={{ color: smeta.color }}>{smeta.label}</p>
                      <div className="space-y-1">
                        {STRENGTH_RULES.map((rule) => (
                          <div key={rule.label} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: rule.test(newPw) ? "rgba(53,200,138,0.15)" : "rgba(139,152,167,0.1)" }}>
                              {rule.test(newPw)
                                ? <svg width="6" height="5" viewBox="0 0 6 5" fill="none"><path d="M1 2.5L2.5 4L5 1" stroke="#35C88A" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                : <div style={{ width: 4, height: 4, borderRadius: 9999, background: "var(--pc-border)" }} />
                              }
                            </div>
                            <span className="text-[10px]" style={{ color: rule.test(newPw) ? "#35C88A" : "var(--pc-muted)" }}>{rule.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pc-muted)" }}>Confirm password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pc-muted)" }} strokeWidth={1.5} />
                    <input
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirmPw}
                      onChange={(e) => { setConfirmPw(e.target.value); setMismatch(false); }}
                      placeholder="Repeat your password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none border transition-colors"
                      style={{
                        background: "var(--pc-surface)",
                        borderColor: mismatch ? "rgba(240,93,94,0.4)" : "var(--pc-border)",
                        color: "var(--pc-foreground)",
                      }}
                    />
                    <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--pc-muted)" }}>
                      {showConfirm ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                  {confirmPw.length > 0 && !mismatch && newPw === confirmPw && (
                    <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: "#35C88A" }}>
                      <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Passwords match
                    </p>
                  )}
                </div>

                {/* Revoke other sessions */}
                <label className="flex items-start gap-3 cursor-pointer select-none px-4 py-3 rounded-xl border" style={{ borderColor: "var(--pc-border)", background: "var(--pc-surface)" }}>
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input type="checkbox" checked={revokeOther} onChange={(e) => setRevokeOther(e.target.checked)} className="sr-only" />
                    <div className="w-4 h-4 rounded border flex items-center justify-center transition-colors" style={revokeOther ? { background: "var(--pc-primary)", borderColor: "var(--pc-primary)" } : { background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
                      {revokeOther && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0C1116" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Sign out of all other sessions</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--pc-muted)" }}>Revokes all other active sessions and API tokens after reset</p>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={score < 2 || !confirmPw}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "var(--pc-primary)", color: "#0C1116" }}
                >
                  Reset password
                </button>
              </form>
            </>
          )}

          {/* ── Step: Success ── */}
          {step === "success" && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(45,212,167,0.1)", border: "1px solid rgba(45,212,167,0.25)" }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--pc-foreground)" }}>Password updated</h1>
              <p className="text-sm leading-relaxed mb-2" style={{ color: "var(--pc-muted)" }}>
                Your password has been changed successfully.
              </p>
              {revokeOther && (
                <p className="text-xs mb-6" style={{ color: "var(--pc-muted)" }}>
                  All other sessions have been signed out.
                </p>
              )}

              <Link
                href="/login"
                className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                Sign in with new password
              </Link>
            </div>
          )}

          <p className="text-xs text-center mt-8" style={{ color: "var(--pc-muted)" }}>
            Need help?{" "}
            <a href="mailto:support@portcullis.dev" className="underline" style={{ color: "var(--pc-primary)" }}>Contact support</a>
          </p>
        </div>
      </div>

      {/* ── Right: grille ───────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ background: "#080D11" }}>
        <PortcullisGrille />
        <div className="absolute bottom-10 left-0 right-0 text-center px-10">
          <p className="text-sm font-medium mb-1" style={{ color: "rgba(241,245,249,0.7)" }}>
            Secure password recovery
          </p>
          <p className="text-xs" style={{ color: "rgba(139,152,167,0.6)" }}>
            Reset links expire after 15 minutes and can only be used once.
          </p>
        </div>
      </div>
    </div>
  );
}
