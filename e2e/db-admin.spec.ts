import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("SuperAdmin can run a read query in the DB console", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/db");
  await expect(page.getByRole("heading", { name: "Database Console" })).toBeVisible();
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/\d+ rows/)).toBeVisible();
  // CSV export button appears with results
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
});

test("a non-SuperAdmin cannot reach the DB console", async ({ page }) => {
  // tarek is an Admin (not SuperAdmin)
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/admin/db");
  await expect(page).toHaveURL("/");
});

test("write-mode guard blocks a mutating query until enabled", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/db");
  await expect(page.getByRole("button", { name: "Run" })).toBeVisible();
  await page.waitForTimeout(700); // let the client console hydrate
  await page.locator("textarea").fill('UPDATE "Task" SET title = title');
  await expect(page.getByText(/Mutating\/DDL query/)).toBeVisible(); // danger banner
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/WRITE_MODE_REQUIRED/)).toBeVisible();
});
