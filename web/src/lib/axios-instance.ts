import Axios from "axios";

export const axiosClient = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  // P1: bound hangs + send HttpOnly SSO cookie for cookie-only flow.
  timeout: 15000,
  withCredentials: true,
});

// Inject Bearer token and CSRF token on every request
axiosClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Production: sessionStorage (tab-scoped) only. HttpOnly `portcullis_auth`
    // cookie is sent automatically via withCredentials for email/SSO logins.
    // Never read localStorage — legacy copies are deleted on read (see lib/auth).
    let token: string | null = null;
    try {
      token = sessionStorage.getItem("portcullis_token");
    } catch {
      token = null;
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const csrfMatch = document.cookie.match(/(?:^|; )portcullis_csrf=([^;]*)/);
    if (csrfMatch) {
      config.headers["X-CSRF-Token"] = decodeURIComponent(csrfMatch[1]);
    }
  }
  return config;
});

// Redirect to login on 401 (preserve destination once)
axiosClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Clear tab-scoped credential + guard cookie (never localStorage —
      // legacy copies are purged by lib/auth on next read).
      try {
        sessionStorage.removeItem("portcullis_token");
      } catch {
        /* ignore */
      }
      try {
        document.cookie = "portcullis_token=; path=/; max-age=0; SameSite=Lax";
      } catch {
        /* ignore */
      }
      const next = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Orval mutator — called as axiosInstance<T>(url, fetchOptions)
 * Returns { data, status, headers } to match orval's generated response types.
 */
export const axiosInstance = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  const { method = "GET", headers, body } = options;

  const response = await axiosClient.request({
    url,
    method: method as string,
    headers: headers as Record<string, string>,
    data: body,
  });

  return {
    data: response.data,
    status: response.status,
    headers: response.headers,
  } as T;
};
