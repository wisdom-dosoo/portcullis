import { test, expect } from "@playwright/test";

// P2 smoke: public routes render; SSO callback supports the P0 cookie-only
// flow (no ?token=) without crashing.
test("login renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button").first()).toBeVisible();
});

test("sso-callback without token stays in processing (cookie flow)", async ({
  page,
}) => {
  await page.goto("/sso-callback");
  await expect(page.getByText(/Completing sign-in/i)).toBeVisible();
});
