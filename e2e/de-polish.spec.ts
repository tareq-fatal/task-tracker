import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test('German UI says "Mandant" (not "Tenant") in the switcher', async ({ page }) => {
  // admin is SuperAdmin (multiple tenants → switcher dropdown is shown)
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/");
  // open the tenant switcher (trigger identified by its tooltip/title)
  await page.getByTitle("Mandant wechseln").click();
  await expect(page.getByText("Mandant", { exact: true })).toBeVisible();
  await expect(page.getByText("Tenant", { exact: true })).toHaveCount(0);
});

test("DB console danger zone uses Mandant wording + count preview", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/db");
  await expect(page.getByText("Mandant-Daten leeren")).toBeVisible();
  await page.waitForTimeout(700); // hydrate
  await page.getByPlaceholder(/Mandant-Slug/).fill("tarek");
  await expect(page.getByText(/Wird dauerhaft entfernt/)).toBeVisible();
});
