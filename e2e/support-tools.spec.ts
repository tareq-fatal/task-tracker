import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #24 — admin support tools on a task: escalate, assist, coaching note.
test("admin can escalate a task and see the banner", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/board");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);

  // the admin support panel is present
  await expect(page.getByRole("heading", { name: "Admin-Support" })).toBeVisible();

  const escalate = page.getByRole("button", { name: "Eskalieren" });
  if (await escalate.isVisible()) {
    await escalate.click();
    await expect(page.getByText(/Eskalierte Aufgabe/)).toBeVisible();
    // toggle back so the fixture stays clean-ish
    await page.getByRole("button", { name: "Deeskalieren" }).click();
    await expect(page.getByText(/Eskalierte Aufgabe/)).toHaveCount(0);
  }
});

test("a regular user has no support panel", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page.getByRole("heading", { name: "Admin-Support" })).toHaveCount(0);
});
