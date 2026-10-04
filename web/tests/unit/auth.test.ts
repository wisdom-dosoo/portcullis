import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// P2: regression tests for the P0/P1 auth-cookie fixes — Secure only on https
// (was breaking http://localhost dev) and token storage round-trip.
describe("lib/auth token storage", () => {
  const TOKEN_KEY = "portcullis_token";
  let protocolSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
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

  it("stores and reads the token from localStorage", async () => {
    vi.stubGlobal("window", { location: { protocol: "http:" } } as never);
    Object.defineProperty(window, "location", {
      value: { protocol: "http:" },
      writable: true,
    });
    const auth = await loadAuth();
    auth.setToken("pk_test_123");
    expect(auth.getToken()).toBe("pk_test_123");
    expect(auth.isAuthenticated()).toBe(true);
    auth.clearToken();
    expect(auth.getToken()).toBeNull();
  });

  it("does not set Secure on http (localhost dev)", async () => {
    Object.defineProperty(window, "location", {
      value: { protocol: "http:" },
      writable: true,
    });
    const auth = await loadAuth();
    auth.setToken("pk_test_abc");
    expect(document.cookie).toContain(TOKEN_KEY);
    expect(document.cookie).not.toContain("Secure");
  });
});
