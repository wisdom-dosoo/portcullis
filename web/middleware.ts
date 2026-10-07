import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const TOKEN_COOKIE = "portcullis_token";
const PROTECTED_PREFIXES = ["/admin", "/dashboard", "/developer"];
const PUBLIC_EXACT = new Set(["/login", "/register", "/privacy", "/terms", "/sso-callback"]);

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/dashboard(.*)",
  "/developer(.*)",
]);

async function portcullisHandler(
  request: NextRequest,
  opts?: { skipBounce?: boolean },
) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isPublic = PUBLIC_EXACT.has(pathname) || pathname === "/";

  // Security headers on every response (live production)
  const response = isProtected || isPublic ? NextResponse.next() : NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // Minimal CSP for dashboard — allow self + inline styles (Next.js/Tailwind) + connect to API.
  // When Clerk is configured, its browser bundle, API calls, avatars, and
  // the Cloudflare challenge iframe must be allowed too — otherwise the
  // <SignIn/>/<SignUp/> cards render blank and the console fills with
  // "Refused to load/script/connect" CSP errors.
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    const apiHost = new URL(apiOrigin).origin;
    const connectSrc = [`'self'`, apiHost];
    const scriptSrc = [`'self'`, `'unsafe-eval'`, `'unsafe-inline'`];
    const imgSrc = [`'self'`, `data:`, `blob:`];
    const frameSrc: string[] = [];
    const workerSrc: string[] = [];
    if (CLERK_KEY) {
      connectSrc.push("https://*.clerk.accounts.dev", "https://*.clerk.com");
      scriptSrc.push(
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://challenges.cloudflare.com",
      );
      imgSrc.push("https://*.clerk.com", "https://img.clerk.com");
      frameSrc.push("https://challenges.cloudflare.com");
      workerSrc.push("'self'", "blob:");
    }
    const directives = [
      "default-src 'self'",
      `connect-src ${connectSrc.join(" ")}`,
      `script-src ${scriptSrc.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src ${imgSrc.join(" ")}`,
      "font-src 'self' data:",
    ];
    if (frameSrc.length > 0) directives.push(`frame-src ${frameSrc.join(" ")}`);
    if (workerSrc.length > 0) directives.push(`worker-src ${workerSrc.join(" ")}`);
    response.headers.set("Content-Security-Policy", directives.join("; "));
  } catch {
    // ignore malformed API_URL
  }

  if (!isProtected) return response;

  // Production: presence gate (fast, no I/O) + server verification.
  // The guard cookie is a static marker — a forged value must NOT grant
  // access. We forward cookies to GET /auth/me and only allow the request
  // through when the backend accepts the session (HttpOnly `portcullis_auth`
  // cookie). Pasted API keys live in sessionStorage (inaccessible to
  // middleware) — those navigations fall through to the client layout, which
  // re-verifies via verifySession() and redirects on 401.
  const guard = request.cookies.get(TOKEN_COOKIE)?.value ?? null;
  const sessionCookie = request.cookies.get("portcullis_auth")?.value ?? null;
  if (!guard && !sessionCookie) {
    // With Clerk configured, a signed-in Clerk user legitimately has no
    // Portcullis session yet — let them through so <ClerkSyncGate/> can mint
    // one via /auth/clerk/sync instead of bouncing to /login in a loop.
    if (opts?.skipBounce) return response;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Server-side verification when an HttpOnly session cookie is present.
  // Fail-open to the client layout only for guard-only (API-key) sessions;
  // fail-closed (redirect) when a session cookie exists but is rejected.
  if (sessionCookie) {
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL ?? process.env.API_INTERNAL_URL ?? "http://localhost:8000";
      const cookieHeader = request.headers.get("cookie") ?? "";
      const verify = await fetch(`${apiBase}/auth/me`, {
        headers: { cookie: cookieHeader, Accept: "application/json" },
      });
      if (!verify.ok) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", pathname);
        loginUrl.searchParams.set("reason", "expired");
        const redirect = NextResponse.redirect(loginUrl);
        // Drop the stale guard so the user does not loop.
        redirect.cookies.set(TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
        return redirect;
      }
    } catch {
      // Backend unreachable — allow through so the client can render
      // "service unavailable" instead of a redirect loop. API calls will
      // still fail closed with 401/503.
    }
  }

  // Full platform-admin check (is_platform_admin flag) is performed client-side
  // in app/admin/layout.tsx via GET /admin/platform/me.
  return response;
}

// With Clerk configured, protected routes additionally require a Clerk
// session (redirects to NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login). Without a key
// the legacy Portcullis-only behavior is preserved byte-for-byte.
// NOTE: clerkMiddleware() is constructed lazily inside the ternary —
// constructing it without a key would throw at module load.
export default CLERK_KEY
  ? clerkMiddleware(async (auth, request: NextRequest) => {
      const { isAuthenticated: clerkAuthed } = await auth();
      if (isClerkProtectedRoute(request) && !clerkAuthed) {
        await auth.protect();
      }
      return portcullisHandler(request, { skipBounce: clerkAuthed });
    })
  : portcullisHandler;

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/developer/:path*", "/login", "/register"],
};
