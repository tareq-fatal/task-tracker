import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("timer starts from the task detail — stop control appears", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/tasks");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await page.waitForTimeout(700); // hydrate

  // v11 time tracking replaced the old TimerControl: start is "Timer starten",
  // stop is "Stopp" (per-entry TaskTimeEntry timer)
  const startBtn = page.getByRole("button", { name: "Timer starten" });
  await expect(startBtn).toBeVisible();
  await startBtn.click();
  await expect(page.getByRole("button", { name: /^Stopp$/ })).toBeVisible({ timeout: 5000 });
  // reset (stop) so we don't leave a running timer in seed data
  await page.getByRole("button", { name: /^Stopp$/ }).click();
  await expect(page.getByRole("button", { name: "Timer starten" })).toBeVisible();
});

test("attachment download route is access-checked (404 for a bogus id)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const r = await page.goto("/download/attachment/does-not-exist");
  expect(r?.status()).toBe(404);
});
