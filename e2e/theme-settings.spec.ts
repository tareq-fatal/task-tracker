import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("theme toggle switches to dark (applies .dark on <html>)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/settings");
  await page.waitForTimeout(500); // hydrate
  await expect(page.getByRole("group", { name: "Design" })).toBeVisible();

  await page.getByRole("button", { name: "Dunkel" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

  // persists across reload (localStorage + no-flash script)
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

  await page.getByRole("button", { name: "Hell" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
});

test("regular user settings are minimal (theme only, no admin/meta cards)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/settings");
  await expect(page.getByRole("group", { name: "Design" })).toBeVisible(); // theme
  // no admin/meta sections
  await expect(page.getByText("Benachrichtigungen", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sprache")).toHaveCount(0); // language hidden for users
  await expect(page.getByText("MS Planner")).toHaveCount(0);
});
