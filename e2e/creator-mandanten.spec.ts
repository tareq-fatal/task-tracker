import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("legacy /admin/tenants redirects to /admin/mandanten", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/tenants");
  await expect(page).toHaveURL(/\/admin\/mandanten/);
  await expect(page.getByRole("heading", { name: "Mandanten" })).toBeVisible();
});

test("admin sees the change-creator control; a regular user does not", async ({ page }) => {
  // admin
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/tasks");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await page.waitForTimeout(600);
  await expect(page.getByRole("button", { name: "Ersteller ändern" })).toBeVisible();

  // regular user (switch via the hard-logout)
  await page.goto("/logout");
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page.getByRole("button", { name: "Ersteller ändern" })).toHaveCount(0);
});
