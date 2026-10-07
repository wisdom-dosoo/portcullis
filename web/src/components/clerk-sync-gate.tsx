"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { markCookieSession, verifySession } from "@/lib/auth";
import { PortcullisLoader } from "@/components/loading-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "60vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--pc-bg)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Exchanges a Clerk session for a Portcullis cookie session.
 *
 * After Clerk sign-in the browser holds a Clerk session but no Portcullis
 * credential yet. This gate POSTs the Clerk JWT to /auth/clerk/sync (which
 * validates it via JWKS, provisions/links the user, and sets HttpOnly
 * `portcullis_auth`), then renders the app. Users with a legacy
 * email/API-key Portcullis session and no Clerk session pass through
 * untouched.
 */
function ClerkGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const [state, setState] = useState<"working" | "ready" | "failed">("working");
  const [detail, setDetail] = useState<string>("sync_failed");

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      if (isSignedIn) {
        if (await verifySession()) {
          if (!cancelled) setState("ready");
          return;
        }
        try {
          const token = await getToken();
          if (!token) throw new Error("no_clerk_token");
          const res = await fetch(`${API_BASE}/auth/clerk/sync`, {
            method: "POST",
            credentials: "include",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              detail?: string;
            } | null;
            throw new Error(body?.detail ?? `sync_failed_${res.status}`);
          }
          markCookieSession(false);
          if (await verifySession()) {
            if (!cancelled) setState("ready");
            return;
          }
          throw new Error("verify_failed");
        } catch (err) {
          if (!cancelled) {
            setDetail(err instanceof Error ? err.message : "sync_failed");
            setState("failed");
          }
        }
        return;
      }
      // No Clerk session — honor a legacy Portcullis session if present.
      if (await verifySession()) {
        if (!cancelled) setState("ready");
        return;
      }
      router.replace("/login");
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, router]);

  if (state === "ready") return <>{children}</>;

  if (state === "failed") {
    return (
      <Center>
        <div className="w-full max-w-sm text-center px-6">
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--pc-foreground)" }}
          >
            Couldn&apos;t sync your session
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--pc-muted)" }}>
            {detail}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--pc-primary)", color: "#0C1116" }}
            >
              Retry
            </button>
            <button
              onClick={() => {
                void (async () => {
                  await signOut();
                  router.replace("/login");
                })();
              }}
              className="px-4 py-2 rounded-xl text-sm border"
              style={{
                borderColor: "var(--pc-border)",
                color: "var(--pc-muted)",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </Center>
    );
  }

  return (
    <Center>
      <PortcullisLoader label="Syncing your session…" />
    </Center>
  );
}

/** Pre-Clerk fallback: Portcullis session only (used when no Clerk key). */
function LegacyGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await verifySession()) {
        if (!cancelled) setReady(true);
        return;
      }
      router.replace("/login");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <Center>
        <PortcullisLoader label="Verifying session…" />
      </Center>
    );
  }
  return <>{children}</>;
}

export function ClerkSyncGate({ children }: { children: React.ReactNode }) {
  if (!CLERK_KEY) return <LegacyGate>{children}</LegacyGate>;
  return <ClerkGate>{children}</ClerkGate>;
}
