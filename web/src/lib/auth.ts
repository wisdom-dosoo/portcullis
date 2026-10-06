/**
 * Production auth storage.
 *
 * Threat model: any JS-readable persistent credential (localStorage) is
 * exfiltrated by a single XSS. So:
 * - Email/SSO login is cookie-only: backend sets HttpOnly `portcullis_auth`
 *   (see api/app/api/auth.py `_set_session_cookie` + api/app/api/sso.py).
 *   The browser sends it via `withCredentials: true`; JS never sees it.
 * - Pasted API keys (`pk_*`) are machine credentials. They live in
 *   `sessionStorage` (tab-scoped, cleared on tab close) — never localStorage —
 *   plus a short-lived JS guard cookie `portcullis_token` used ONLY by
 *   Next.js middleware for presence checks. The authoritative check is
 *   server-side `GET /auth/me` (see middleware.ts).
 * - A legacy localStorage entry is migrated once then deleted, so an old
 *   install does not keep a persistent XSS target around.
 */

const SESSION_KEY = "portcullis_token";
const LEGACY_KEY = "portcullis_token"; // same name, was in localStorage
const COOKIE_KEY = "portcullis_token"; // JS guard cookie (presence only)
const CSRF_COOKIE_KEY = "portcullis_csrf";
const COOKIE_MAX_AGE = 60 * 60 * 12; // 12h guard cookie (not the session itself)
const COOKIE_MAX_AGE_REMEMBER = 60 * 60 * 24 * 7; // 7d when "remember" checked

function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

function setGuardCookie(remember = false): void {
  if (typeof document === "undefined") return;
  const secure = isSecureContext() ? "; Secure" : "";
  const maxAge = remember ? COOKIE_MAX_AGE_REMEMBER : COOKIE_MAX_AGE;
  // Value is a static marker — NOT the credential. Middleware only checks
  // presence; real verification happens server-side via /auth/me.
  document.cookie =
    `${COOKIE_KEY}=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function setCsrfCookie(): void {
  if (typeof document === "undefined") return;
  const existing = getCsrfToken();
  if (existing) return;
  const token = generateCsrfToken();
  const secure = isSecureContext() ? "; Secure" : "";
  document.cookie =
    `${CSRF_COOKIE_KEY}=${encodeURIComponent(token)}; path=/; ` +
    `max-age=${COOKIE_MAX_AGE}; SameSite=Strict${secure}`;
}

export function ensureCsrfCookie(): void {
  setCsrfCookie();
}

function clearGuardCookie(): void {
  if (typeof document === "undefined") return;
  const secure = isSecureContext() ? "; Secure" : "";
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `${CSRF_COOKIE_KEY}=; path=/; max-age=0; SameSite=Strict${secure}`;
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${base}/auth/sso/sso/logout`, { credentials: "include" }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** One-time migration: move a legacy localStorage key to sessionStorage. */
function migrateLegacyToken(): string | null {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.removeItem(LEGACY_KEY);
      if (legacy.trim()) {
        try {
          sessionStorage.setItem(SESSION_KEY, legacy);
        } catch {
          /* storage unavailable */
        }
        return legacy;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return migrateLegacyToken();
}

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Store a pasted API key for this tab only. Email/SSO logins should call
 * `markCookieSession()` instead — no JS credential at all.
 */
export function setToken(token: string, remember = false): void {
  try {
    sessionStorage.setItem(SESSION_KEY, token);
  } catch {
    /* ignore */
  }
  // Remove any legacy persistent copy immediately.
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  setGuardCookie(remember);
  setCsrfCookie();
}

/** Mark a cookie-only (email/SSO) session — no JS credential stored. */
export function markCookieSession(remember = false): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  setGuardCookie(remember);
  setCsrfCookie();
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  clearGuardCookie();
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  if (getToken()) return true;
  // Cookie-only session: guard cookie present (middleware + layouts verify
  // server-side via /auth/me; this is only the synchronous hint).
  try {
    return document.cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE_KEY}=`));
  } catch {
    return false;
  }
}

/**
 * Server-side session check. Returns true only when the backend accepts the
 * current credential (Authorization header from sessionStorage, or HttpOnly
 * cookie via `credentials: include`).
 */
export async function verifySession(): Promise<boolean> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const token = getToken();
    const res = await fetch(`${base}/auth/me`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
