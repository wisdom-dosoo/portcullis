"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { LegacyRegisterForm } from "./legacy-form";

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

/* ── Main page ───────────────────────────────────────────────────── */

export default function RegisterPage() {
  // No Clerk key: full legacy sign-up (create / join / invitation flows).
  if (!CLERK_KEY) return <LegacyRegisterForm />;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row overflow-hidden" style={{ background: "var(--pc-bg)" }}>

      {/* ── Left: form ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center px-6 py-6 lg:py-8 lg:h-screen lg:overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-4">
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
          <p className="text-sm mb-4" style={{ color: "var(--pc-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium" style={{ color: "var(--pc-primary)" }}>Sign in</Link>
          </p>

          <div className="flex justify-center">
            <SignUp
              forceRedirectUrl="/dashboard"
              signInUrl="/login"
              appearance={CLERK_APPEARANCE}
            />
          </div>
          <p className="text-xs text-center mt-4 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            The first account to sign in becomes the organization owner.
            Teammates are added afterwards from the dashboard under
            Access Control → Members.
          </p>

          <p className="text-xs text-center mt-4" style={{ color: "var(--pc-muted)" }}>
            Protected by Portcullis security.{" "}
            <Link href="/privacy" className="underline" style={{ color: "var(--pc-primary)" }}>Privacy notice</Link>
          </p>
        </div>
      </div>

      {/* ── Right: statement panel ──────────────────────────────── */}
      <div
        className="hidden lg:flex flex-1 relative flex-col items-center justify-center overflow-hidden"
        style={{ background: "#080D11" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(45,212,167,0.07) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 mt-10 max-w-sm text-center px-8">
          <p
            className="text-lg font-semibold leading-snug"
            style={{ color: "var(--pc-foreground)" }}
          >
            Zero-trust access for every MCP tool
          </p>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Portcullis enforces policy, logs every call, and keeps your infrastructure secure.
          </p>
        </div>
      </div>
    </div>
  );
}
