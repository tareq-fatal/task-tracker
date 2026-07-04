import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("user can (re)start the welcome tour and skip it", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de"); // restart-tour lives in admin settings now (#21)

  // Deterministic: restart the intro from settings, then it runs on the dashboard
  await page.goto("/settings");
  await page.getByRole("button", { name: /Einführung neu starten/ }).click();

  await expect(page.getByText(/Willkommen/)).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "Überspringen" }).click();
  await expect(page.getByText(/Willkommen/)).toHaveCount(0);
});

test("admin who already saw the tour does not get it", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Willkommen/)).toHaveCount(0);
});
