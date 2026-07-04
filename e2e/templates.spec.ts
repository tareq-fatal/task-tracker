import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("admin saves a task template and instantiates a task from it", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/templates");

  // save a template (retry guards hydration; .first() tolerates a retry dup)
  await expect(async () => {
    await page.getByPlaceholder("Vorlagenname").fill("Bug Report");
    await page.getByPlaceholder("Aufgabentitel").fill("TPL Bug Report");
    await page.getByRole("button", { name: "Vorlage speichern" }).click();
    await expect(page.getByTestId("tpl-item").filter({ hasText: "Bug Report" }).first()).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 20000 });

  // instantiate the Bug Report template specifically (grouping reorders the list)
  await page
    .getByTestId("tpl-item")
    .filter({ hasText: "Bug Report" })
    .first()
    .getByRole("button", { name: "Aufgabe erstellen" })
    .click();
  await expect(page.getByRole("heading", { name: "TPL Bug Report" })).toBeVisible();
});

// #22 — templates can carry a category, and the list groups by it.
test("admin sets a category and templates group under it", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/templates");

  await expect(async () => {
    await page.getByPlaceholder("Vorlagenname").fill("Onboarding");
    await page.getByPlaceholder("Kategorie (optional)").fill("HR");
    await page.getByPlaceholder("Aufgabentitel").fill("TPL Onboarding");
    await page.getByRole("button", { name: "Vorlage speichern" }).click();
    await expect(page.getByTestId("tpl-item").filter({ hasText: "Onboarding" }).first()).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 20000 });

  // a "HR" group header groups the template
  const hrGroup = page.getByTestId("tpl-group").filter({ hasText: "HR" });
  await expect(hrGroup.getByText("HR").first()).toBeVisible();
  await expect(hrGroup.getByTestId("tpl-item").filter({ hasText: "Onboarding" }).first()).toBeVisible();
});

test("a non-admin cannot open the templates manager", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/admin/templates");
  await expect(page).toHaveURL("/");
});
