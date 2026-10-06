import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Ship-checklist: sessionStorage (tab-scoped) only — localStorage is a legacy
// migration source, never a write target. Guard cookie is a static marker.
describe("lib/auth token storage", () => {
  const TOKEN_KEY = "portcullis_token";
  let protocolSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    document.cookie
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter(Boolean)
      .forEach((name) => {
        document.cookie = `${name}=; path=/; max-age=0`;
      });
  });

  afterEach(() => {
    protocolSpy?.mockRestore();
    vi.unstubAllGlobals();
  });

  async function loadAuth() {
    return import("@/lib/auth");
  }

  function httpProto() {
    Object.defineProperty(window, "location", {
      value: { protocol: "http:" },
      writable: true,
      configurable: true,
    });
  }

  it("stores the API key in sessionStorage, never localStorage", async () => {
    httpProto();
    const auth = await loadAuth();
    auth.setToken("pk_test_123");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("pk_test_123");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(auth.getToken()).toBe("pk_test_123");
    expect(auth.isAuthenticated()).toBe(true);
    auth.clearToken();
    expect(auth.getToken()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it("migrates a legacy localStorage key once then deletes it", async () => {
    httpProto();
    localStorage.setItem(TOKEN_KEY, "pk_legacy_abc");
    const auth = await loadAuth();
    expect(auth.getToken()).toBe("pk_legacy_abc");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("pk_legacy_abc");
  });

  it("cookie-only sessions store no JS credential", async () => {
    httpProto();
    const auth = await loadAuth();
    auth.markCookieSession();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
    auth.clearToken();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it("does not set Secure on http (localhost dev)", async () => {
    httpProto();
    const auth = await loadAuth();
    auth.setToken("pk_test_abc");
    expect(document.cookie).toContain(TOKEN_KEY);
    expect(document.cookie).not.toContain("Secure");
  });

  it("verifySession returns false when the backend rejects", async () => {
    httpProto();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false } as Response),
    );
    const auth = await loadAuth();
    await expect(auth.verifySession()).resolves.toBe(false);
  });

  it("verifySession sends the tab key as Bearer", async () => {
    httpProto();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const auth = await loadAuth();
    auth.setToken("pk_tab_xyz");
    await expect(auth.verifySession()).resolves.toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer pk_tab_xyz",
    );
  });
});
