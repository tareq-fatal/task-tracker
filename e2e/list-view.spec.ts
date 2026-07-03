import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("list view renders, sorts, and bulk-updates a selected task", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/list");
  await expect(page.getByRole("heading", { name: "Listenansicht" })).toBeVisible();
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();
  await page.waitForTimeout(700); // hydrate

  // sortable header (Titel) toggles order without error
  await page.getByRole("button", { name: /Titel/ }).click();
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();

  // select ONE row → bulk toolbar appears
  await page.locator('[data-testid="list-row"] input[type="checkbox"]').first().check();
  await expect(page.getByText(/ausgewählt/)).toBeVisible();

  // bulk set status (reversible) → action runs, selection clears
  await page.getByLabel("Status setzen").selectOption("InProgress");
  await expect(page.getByText(/ausgewählt/)).toHaveCount(0);
});
