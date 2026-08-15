"use client";

import { useState } from "react";
import Link from "next/link";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Shield, Copy, Download, CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";

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

/* ── Mock data ───────────────────────────────────────────────────── */

const SETUP_KEY = "JBSW Y3DP EHPK 3PXP";
const TOTP_URI  = "otpauth://totp/Portcullis:user@example.com?secret=JBSWC3DPEHPK3PXP&issuer=Portcullis&algorithm=SHA1&digits=6&period=30";

const RECOVERY_CODES = [
  "A4K2-9MXN", "B7RQ-1PLW", "C3YD-5HJT", "D9WZ-8GNK",
  "E1SV-4BFM", "F6PX-2LRC", "G8NT-7DVQ", "H5JK-3YWA",
];

/* ── QR code placeholder ─────────────────────────────────────────── */

function QRPlaceholder({ uri }: { uri: string }) {
  // Generate a deterministic dot grid pattern from the URI for visual effect
  const dots: { x: number; y: number }[] = [];
  for (let i = 0; i < uri.length && dots.length < 120; i++) {
    const c = uri.charCodeAt(i);
    const x = (c * 7 + i * 3) % 19;
    const y = (c * 13 + i * 7) % 19;
    if (!dots.find((d) => d.x === x && d.y === y)) dots.push({ x, y });
  }

  return (
    <div
      className="relative mx-auto p-3 rounded-2xl"
      style={{ background: "#fff", width: 160, height: 160 }}
    >
      {/* Corner markers */}
      {[[0, 0], [0, 13], [13, 0]].map(([cx, cy], i) => (
        <div key={i} className="absolute" style={{
          left: cx === 0 ? 12 : "auto", right: cx === 13 ? 12 : "auto",
          top:  cy === 0 ? 12 : "auto", bottom: cy === 13 ? 12 : "auto",
          width: 28, height: 28, border: "3px solid #0C1116", borderRadius: 3,
          background: i === 2 ? "none" : "#0C1116",
        }}>
          {i === 2 && <div style={{ position: "absolute", inset: 4, background: "#0C1116", borderRadius: 1 }} />}
        </div>
      ))}
      {/* Data dots */}
      <svg className="absolute inset-0" width="160" height="160" viewBox="0 0 160 160">
        {dots.map((d, i) => (
          <rect key={i} x={12 + d.x * 7} y={12 + d.y * 7} width="5" height="5" fill="#0C1116" rx="0.5" />
        ))}
      </svg>
    </div>
  );
}

/* ── Step components ─────────────────────────────────────────────── */

type Step = "setup" | "verify" | "recovery" | "done";

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "setup",    label: "Scan QR" },
    { id: "verify",   label: "Verify" },
    { id: "recovery", label: "Recovery" },
    { id: "done",     label: "Complete" },
  ];
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={i <= idx
                ? { background: "var(--pc-primary)", color: "#0C1116" }
                : { background: "var(--pc-surface)", border: "1px solid var(--pc-border)", color: "var(--pc-muted)" }
              }
            >
              {i < idx ? "✓" : i + 1}
            </div>
            <span className="text-[9px] whitespace-nowrap" style={{ color: i <= idx ? "var(--pc-primary)" : "var(--pc-muted)" }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-12 h-px mb-4 mx-1" style={{ background: i < idx ? "var(--pc-primary)" : "var(--pc-border)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function MFASetupPage() {
  const [step, setStep]         = useState<Step>("setup");
  const [code, setCode]         = useState("");
  const [codeError, setCodeError] = useState(false);
  const [showKey, setShowKey]   = useState(false);
  const [copied, setCopied]     = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [revokeOther, setRevokeOther] = useState(false);

  async function handleCopy(text: string, id: string) {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  function downloadCodes() {
    const content = "Portcullis MFA Recovery Codes\n" +
      "Keep these codes safe. Each code can only be used once.\n\n" +
      RECOVERY_CODES.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "portcullis-recovery-codes.txt"; a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  function verifyCode() {
    // Stub: accept any 6-digit code
    if (/^\d{6}$/.test(code)) {
      setStep("recovery");
    } else {
      setCodeError(true);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--pc-bg)" }}>

      {/* ── Left: form ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--pc-primary)" }}>
              <Shield className="w-4 h-4" style={{ color: "#0C1116" }} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none" style={{ color: "var(--pc-foreground)" }}>Portcullis</p>
              <p className="text-[10px] font-mono" style={{ color: "var(--pc-muted)" }}>MCP Gateway</p>
            </div>
          </div>

          <StepIndicator current={step} />

          {/* ── Step: Setup ── */}
          {step === "setup" && (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Set up authenticator</h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                Use an authenticator app like Google Authenticator, Authy, or 1Password to scan the QR code below.
              </p>

              <div className="rounded-2xl border p-6 mb-4 flex flex-col items-center gap-4" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
                <QRPlaceholder uri={TOTP_URI} />
                <p className="text-xs text-center" style={{ color: "var(--pc-muted)" }}>
                  Scan with your authenticator app
                </p>
              </div>

              {/* Manual setup */}
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="w-full text-xs text-left px-4 py-3 rounded-xl border mb-6 transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
              >
                {showKey ? "Hide" : "Can't scan?"} Enter the setup key manually
              </button>

              {showKey && (
                <div className="rounded-xl border p-4 mb-6" style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--pc-muted)" }}>Setup key</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 text-sm font-mono tracking-widest" style={{ color: "var(--pc-primary)" }}>{SETUP_KEY}</code>
                    <button
                      type="button"
                      onClick={() => handleCopy(SETUP_KEY.replace(/\s/g, ""), "key")}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                      style={{ color: copied === "key" ? "#2DD4A7" : "var(--pc-muted)" }}
                    >
                      {copied === "key" ? <CheckCircle2 className="w-4 h-4" strokeWidth={2} /> : <Copy className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                  <div className="mt-3 space-y-1">
                    {[["Type", "TOTP"], ["Algorithm", "SHA-1"], ["Digits", "6"], ["Period", "30s"]].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[10px]">
                        <span style={{ color: "var(--pc-muted)" }}>{k}</span>
                        <span style={{ color: "var(--pc-foreground)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep("verify")}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                I&apos;ve scanned the QR code
              </button>
            </>
          )}

          {/* ── Step: Verify ── */}
          {step === "verify" && (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Enter verification code</h1>
              <p className="text-sm mb-6" style={{ color: "var(--pc-muted)" }}>
                Open your authenticator app and enter the 6-digit code.
              </p>

              {codeError && (
                <div className="flex items-start gap-3 rounded-xl px-4 py-3 border mb-4" style={{ background: "rgba(240,93,94,0.08)", borderColor: "rgba(240,93,94,0.3)" }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F05D5E" }} strokeWidth={2} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#F05D5E" }}>Invalid code</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>Check your authenticator app and try again. Codes expire every 30 seconds.</p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--pc-muted)" }}>6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setCodeError(false); }}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl text-2xl font-mono tracking-[0.5em] text-center outline-none border transition-colors"
                  style={{
                    background: "var(--pc-surface)",
                    borderColor: codeError ? "rgba(240,93,94,0.4)" : "var(--pc-border)",
                    color: "var(--pc-foreground)",
                  }}
                  autoFocus
                />
              </div>

              <button
                type="button"
                onClick={verifyCode}
                disabled={code.length !== 6}
                className="w-full py-2.5 rounded-xl text-sm font-semibold mb-3 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                Verify code
              </button>

              <button
                type="button"
                onClick={() => { setStep("setup"); setCode(""); setCodeError(false); }}
                className="w-full py-2.5 rounded-xl text-sm border transition-colors hover:bg-white/5 flex items-center justify-center gap-2"
                style={{ borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
              >
                <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Back to QR code
              </button>
            </>
          )}

          {/* ── Step: Recovery ── */}
          {step === "recovery" && (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--pc-foreground)" }}>Save your recovery codes</h1>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                If you lose access to your authenticator, use one of these codes to sign in. Each code can only be used once.
              </p>

              <div className="rounded-xl border p-4 mb-4" style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {RECOVERY_CODES.map((c) => (
                    <code key={c} className="text-xs font-mono px-2.5 py-1.5 rounded-lg text-center" style={{ background: "var(--pc-elevated)", color: "var(--pc-foreground)" }}>
                      {c}
                    </code>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(RECOVERY_CODES.join("\n"), "codes")}
                  className="w-full text-xs py-2 rounded-lg border flex items-center justify-center gap-2 transition-colors hover:bg-white/5"
                  style={{ borderColor: "var(--pc-border)", color: copied === "codes" ? "#2DD4A7" : "var(--pc-muted)" }}
                >
                  {copied === "codes"
                    ? <><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} /> Copied!</>
                    : <><Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> Copy all codes</>}
                </button>
              </div>

              <button
                type="button"
                onClick={downloadCodes}
                className="w-full py-2.5 rounded-xl text-sm border flex items-center justify-center gap-2 mb-6 transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--pc-border)", color: downloaded ? "#35C88A" : "var(--pc-muted)" }}
              >
                {downloaded
                  ? <><CheckCircle2 className="w-4 h-4" strokeWidth={2} /> Downloaded</>
                  : <><Download className="w-4 h-4" strokeWidth={1.5} /> Download recovery codes</>}
              </button>

              <div
                className="rounded-xl border px-4 py-3 mb-4 flex items-start gap-3"
                style={{ background: "rgba(244,185,66,0.06)", borderColor: "rgba(244,185,66,0.25)" }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F4B942" }} strokeWidth={2} />
                <p className="text-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
                  Store these codes somewhere safe. You won&apos;t be able to see them again after this step.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep("done")}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                I&apos;ve saved my recovery codes
              </button>
            </>
          )}

          {/* ── Step: Done ── */}
          {step === "done" && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(45,212,167,0.1)", border: "1px solid rgba(45,212,167,0.25)" }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: "#2DD4A7" }} strokeWidth={1.5} />
              </div>
              <h1 className="text-xl font-bold mb-2" style={{ color: "var(--pc-foreground)" }}>MFA enabled</h1>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--pc-muted)" }}>
                Your account is now protected with multi-factor authentication. You&apos;ll be asked for a code each time you sign in.
              </p>

              <label className="flex items-center gap-3 cursor-pointer select-none text-left mb-6 px-4 py-3 rounded-xl border" style={{ borderColor: "var(--pc-border)", background: "var(--pc-surface)" }}>
                <div className="relative flex-shrink-0">
                  <input type="checkbox" checked={revokeOther} onChange={(e) => setRevokeOther(e.target.checked)} className="sr-only" />
                  <div className="w-4 h-4 rounded border flex items-center justify-center transition-colors" style={revokeOther ? { background: "var(--pc-primary)", borderColor: "var(--pc-primary)" } : { background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}>
                    {revokeOther && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0C1116" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--pc-foreground)" }}>Sign out of all other sessions</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--pc-muted)" }}>Revokes all existing API tokens and active sessions</p>
                </div>
              </label>

              <Link
                href="/dashboard"
                className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                Continue to dashboard
              </Link>
            </div>
          )}

          <p className="text-xs text-center mt-8" style={{ color: "var(--pc-muted)" }}>
            Need help?{" "}
            <Link href="#" className="underline" style={{ color: "var(--pc-primary)" }}>Contact support</Link>
          </p>
        </div>
      </div>

      {/* ── Right: grille ───────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ background: "#080D11" }}>
        <PortcullisGrille />
        <div className="absolute bottom-10 left-0 right-0 text-center px-10">
          <p className="text-sm font-medium mb-1" style={{ color: "rgba(241,245,249,0.7)" }}>
            Multi-factor authentication
          </p>
          <p className="text-xs" style={{ color: "rgba(139,152,167,0.6)" }}>
            Add a second layer of protection to your Portcullis account.
          </p>
        </div>
      </div>
    </div>
  );
}
