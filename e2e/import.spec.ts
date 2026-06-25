import { existsSync } from "fs";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

const FIXTURE = "e2e/fixtures/SAP_B1.xlsx";

// The real SAP-B1 export holds internal data, so it's gitignored. These tests
// run locally when the fixture is present and skip cleanly in CI without it.
test.skip(!existsSync(FIXTURE), "SAP_B1.xlsx fixture not present");

test("preview parses the SAP B1 plan (903 tasks, 6 users)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/import");

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByRole("button", { name: "Vorschau" }).click();

  await expect(page.getByText("SAP B1")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("903", { exact: true })).toBeVisible();
  await expect(page.getByText("6", { exact: true })).toBeVisible();
});

test("import creates the tasks, then is idempotent", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/import");

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByRole("button", { name: "Vorschau" }).click();
  await expect(page.getByText("SAP B1")).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: "Jetzt importieren" }).click();
  await expect(
    page.getByText(/erfolgreich abgeschlossen/).first()
  ).toBeVisible({ timeout: 90000 });

  // Re-preview → all 903 now reported as already imported (idempotent)
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByRole("button", { name: "Vorschau" }).click();
  await expect(
    page.getByText(/903 bereits importiert/)
  ).toBeVisible({ timeout: 20000 });
});
