import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #12 — a comment I post shows a delivery receipt (✓ sent, ✓✓ read by others).
test("my own comment shows a read-receipt checkmark", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/board");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await page.waitForTimeout(1200); // let the comment form hydrate

  const note = "Receipt-Test " + Date.now().toString().slice(-6);
  await page.locator('textarea[name="content"]').fill(note);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByText(note).first()).toBeVisible({ timeout: 8000 });

  // the posted comment carries a receipt icon (Gesendet ✓ or Gelesen ✓✓)
  await expect(
    page.locator('[aria-label="Gesendet"], [aria-label="Gelesen"]').first()
  ).toBeVisible();
});
