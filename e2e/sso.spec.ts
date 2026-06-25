import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// SSO providers need real OAuth app credentials (set via env on the server).
// Without them the login page must NOT show SSO buttons and the classic
// username/password flow must keep working untouched.
test("login page hides SSO buttons when no provider is configured", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByTestId("sso-buttons")).toHaveCount(0);
  // classic login still present
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("password login still works (SSO is additive, not a replacement)", async ({
  page,
}) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await expect(page).toHaveURL("/");
});

test("tenant admin sees the SSO settings card", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/settings");
  await expect(page.getByText("Single Sign-On (SSO)")).toBeVisible();
  // domains field + each provider label rendered
  await expect(page.locator('input[name="domains"]')).toBeVisible();
  for (const label of ["Microsoft", "Google", "GitHub", "Apple"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test("a normal user does NOT see the SSO settings card", async ({ page }) => {
  // alice is a plain User in the objektus tenant (seeded)
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/settings");
  await expect(page.getByText("Single Sign-On (SSO)")).toHaveCount(0);
});
