"use client";

import { usePlatformAdminMeAdminPlatformMeGet } from "@/api/generated";
import { isAuthenticated } from "@/lib/auth";

/**
 * Shared platform-admin (super admin) check.
 *
 * The Platform Admin area is secret: only callers the backend confirms via
 * `GET /admin/platform/me` may see it. Every consumer shares one cached
 * query, so mounting it in several components costs a single request.
 */
export function useIsPlatformAdmin(): boolean {
  const resp = usePlatformAdminMeAdminPlatformMeGet({
    query: {
      enabled: isAuthenticated() && typeof window !== "undefined",
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  });
  return resp.data?.status === 200;
}
