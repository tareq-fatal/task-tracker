import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Hardening tests on top of tenant.spec.ts (which proves a tenant user never
 * sees another tenant's data and cannot switch via /t/{slug}).
 *
 * NOTE: a direct-ID cross-tenant 404 probe needs to switch users mid-test, but
 * this CI chromium rejects Storage.clearCookies / newContext, so that exact
 * flow can't run here. Cross-tenant data isolation is instead proven by
 * tenant.spec.ts (behavioral) + scripts/audit-tenant-scope.mjs (static: every
 * tenant-scoped query is filtered). The detail pages enforce 404 in code via
 * `resource.tenantId !== tenant.id → notFound()`.
 */

test("tenant user is hard-locked to their own tenant on /t/{slug}", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");
  // attempting to switch into another tenant is ignored
  await page.goto("/t/marine");
  await expect(page).toHaveURL("/");
  await page.goto("/t/objektus");
  await expect(page).toHaveURL("/");
  // and no foreign-tenant data is visible anywhere reachable
  await page.goto("/admin/tasks");
  await expect(page.getByText("Radar-Kalibrierung Pier 3")).toHaveCount(0); // marine
  await expect(page.getByText("إعادة تصميم الصفحة الرئيسية")).toHaveCount(0); // objektus
});

test("a plain user cannot reach admin-only pages", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  for (const url of ["/admin/users", "/admin/teams", "/reports", "/sprints", "/admin/import"]) {
    await page.goto(url);
    await expect(page).toHaveURL("/"); // non-admin → bounced home
  }
});
