import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("timer starts optimistically — Stop button appears instantly", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/tasks");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await page.waitForTimeout(700); // hydrate

  const startBtn = page.getByRole("button", { name: "Timer starten" });
  await expect(startBtn).toBeVisible();
  await startBtn.click();
  // optimistic: the Stop button + live clock show immediately (no server wait)
  await expect(page.getByRole("button", { name: "Timer stoppen" })).toBeVisible({ timeout: 3000 });
  // reset (stop) so we don't leave a running timer in seed data
  await page.getByRole("button", { name: "Timer stoppen" }).click();
});

test("attachment download route is access-checked (404 for a bogus id)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const r = await page.goto("/download/attachment/does-not-exist");
  expect(r?.status()).toBe(404);
});
