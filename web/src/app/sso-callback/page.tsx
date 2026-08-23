"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { setToken } from "@/lib/auth";

/* ── SSO callback ───────────────────────────────────────────────── */

function SsoCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token");
  const error = searchParams.get("error");
  const status: "processing" | "error" | "done" =
    error || (!token && searchParams.size > 0)
      ? "error"
      : token
        ? "done"
        : "processing";

  useEffect(() => {
    if (!token || error) return;
    setToken(token);
    router.replace("/dashboard");
  }, [token, error, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--pc-bg)" }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: "var(--pc-primary)" }}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <rect x="4"  y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
            <rect x="14" y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
            <rect x="24" y="4"  width="4" height="24" rx="1" fill="#0C1116" opacity="0.9" />
            <rect x="4"  y="4"  width="24" height="4"  rx="1" fill="#0C1116" opacity="0.7" />
            <rect x="4"  y="14" width="24" height="3"  rx="1" fill="#0C1116" opacity="0.5" />
          </svg>
        </div>

        {status === "processing" && (
          <>
            <Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: "var(--pc-primary)" }} />
            <h1 className="text-lg font-semibold mt-4" style={{ color: "var(--pc-foreground)" }}>
              Completing sign-in…
            </h1>
            <p className="text-sm mt-1.5" style={{ color: "var(--pc-muted)" }}>
              Verifying your identity with your provider
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertTriangle className="w-6 h-6 mx-auto" style={{ color: "#F05D5E" }} />
            <h1 className="text-lg font-semibold mt-4" style={{ color: "var(--pc-foreground)" }}>
              Sign-in failed
            </h1>
            <p className="text-sm mt-1.5" style={{ color: "var(--pc-muted)" }}>
              The identity provider did not complete the sign-in. Please try again.
            </p>
            <button
              onClick={() => router.replace("/login")}
              className="mt-6 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              Back to sign in
            </button>
          </>
        )}

        {status === "done" && (
          <>
            <CheckCircle2 className="w-6 h-6 mx-auto" style={{ color: "#35C88A" }} />
            <h1 className="text-lg font-semibold mt-4" style={{ color: "var(--pc-foreground)" }}>
              Signed in
            </h1>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={null}>
      <SsoCallbackHandler />
    </Suspense>
  );
}