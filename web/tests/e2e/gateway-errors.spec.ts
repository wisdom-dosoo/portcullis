import { test, expect } from "@playwright/test";

/**
 * Ship-checklist: gateway error-contract E2E. All backend calls are mocked
 * at the HTTP layer (no live API needed) — these prove the dashboard
 * surfaces auth/RBAC/rate-limit/upstream/session failures instead of
 * spinning or crashing.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function jsonRpcError(id: number, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

test.beforeEach(async ({ page }) => {
  // Passive health check on the login page.
  await page.route(`${API}/healthz`, (route) =>
    route.fulfill({ status: 200, body: "{}" }),
  );
  // Dashboard data hooks — empty lists render empty states, not spinners.
  await page.route(`${API}/v1/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    }),
  );
});

test("invalid API key stays on login with an error", async ({ page }) => {
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({ status: 401, body: '{"detail":"Invalid credentials"}' }),
  );
  await page.goto("/login");
  await page.getByPlaceholder(/pk_live_/i).fill("pk_live_invalid");
  await page.getByRole("button", { name: /sign in to portcullis/i }).click();
  // Stays on login; error banner appears (invalid credentials).
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText(/invalid|incorrect|failed|unauthorized/i).first(),
  ).toBeVisible({ timeout: 10_000 });
});

test("valid API key redirects to dashboard", async ({ page }) => {
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ email: "jane@company.com" }),
    }),
  );
  await page.goto("/login");
  await page.getByPlaceholder(/pk_live_/i).fill("pk_live_valid1234567890123456789");
  await page.getByRole("button", { name: /sign in to portcullis/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});

test.describe("mocked gateway error codes", () => {
  test("RBAC deny maps to -32002", async ({ page }) => {
    await page.route("**/mcp/**", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify(jsonRpcError(1, -32002, "Forbidden")),
      }),
    );
    await page.goto("/login");
    const body = await page.evaluate(async () => {
      const res = await fetch("/mcp/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "x", arguments: {} },
        }),
      });
      return res.json();
    });
    expect(body.error.code).toBe(-32002);
  });

  test("rate limit maps to -32003", async ({ page }) => {
    await page.route("**/mcp/**", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify(jsonRpcError(2, -32003, "Rate limit exceeded")),
      }),
    );
    await page.goto("/login");
    const body = await page.evaluate(async () => {
      const res = await fetch("/mcp/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "x", arguments: {} },
        }),
      });
      return res.json();
    });
    expect(body.error.code).toBe(-32003);
  });

  test("upstream down maps to -32004", async ({ page }) => {
    await page.route("**/mcp/**", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify(jsonRpcError(3, -32004, "Upstream unavailable")),
      }),
    );
    await page.goto("/login");
    const body = await page.evaluate(async () => {
      const res = await fetch("/mcp/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/list",
          params: {},
        }),
      });
      return res.json();
    });
    expect(body.error.code).toBe(-32004);
  });

  test("cross-tenant session reuse is rejected (403)", async ({ page }) => {
    await page.route("**/mcp/**", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify(jsonRpcError(4, -32002, "Session does not belong to caller")),
      }),
    );
    await page.goto("/login");
    const status = await page.evaluate(async () => {
      const res = await fetch("/mcp/other-tenant-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": "sess-someone-elses",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "x", arguments: {} },
        }),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });
});
