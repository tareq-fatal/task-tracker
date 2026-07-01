import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("tenant admin picks a theme, sees the live preview, and saves", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/settings/branding");
  await expect(page.getByRole("heading", { name: "White-Label / Branding" })).toBeVisible();
  await expect(page.getByTestId("brand-preview")).toBeVisible();
  await page.waitForTimeout(700); // hydrate

  await page.locator("select").first().selectOption("sage-modern");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert ✓")).toBeVisible();

  // reset to the default so we don't leave the shared tenant re-themed
  await page.locator("select").first().selectOption("ocean-pro");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert ✓")).toBeVisible();
});

test("a non-admin cannot open branding settings", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/settings/branding");
  await expect(page).toHaveURL("/");
});
