import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "portcullis_token";
const PROTECTED_PREFIXES = ["/admin", "/dashboard", "/developer"];
const PUBLIC_EXACT = new Set(["/login", "/register", "/privacy", "/terms", "/sso-callback"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isPublic = PUBLIC_EXACT.has(pathname) || pathname === "/";

  // Security headers on every response (live production)
  const response = isProtected || isPublic ? NextResponse.next() : NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // Minimal CSP for dashboard — allow self + inline styles (Next.js/Tailwind) + connect to API
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    const apiHost = new URL(apiOrigin).origin;
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `connect-src 'self' ${apiHost}`,
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
      ].join("; ")
    );
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

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/developer/:path*", "/login", "/register"],
};
