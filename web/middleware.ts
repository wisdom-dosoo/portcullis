import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "portcullis_token";
const PROTECTED_PREFIXES = ["/admin", "/dashboard", "/developer"];
const PUBLIC_EXACT = new Set(["/login", "/register", "/privacy", "/terms", "/sso-callback"]);

export function middleware(request: NextRequest) {
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

  // Middleware runs on edge — can only read cookies, not localStorage.
  // lib/auth.ts dual-writes localStorage → cookie on setToken so this check
  // catches unauthenticated direct navigations before the client layout flashes.
  const token = request.cookies.get(TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Full platform-admin check (is_platform_admin flag) is performed client-side
  // in app/admin/layout.tsx via GET /admin/platform/me. Middleware cannot
  // verify that without an authenticated fetch (which would require forwarding
  // the token) — so we only enforce presence here and let the layout redirect
  // non-admins to /dashboard. This still prevents unauthenticated flash and
  // gives production a defense-in-depth layer.
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/developer/:path*", "/login", "/register"],
};
