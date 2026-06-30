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

  // instantiate → lands on a new task with the template title
  await page.getByRole("button", { name: "Aufgabe erstellen" }).first().click();
  await expect(page.getByRole("heading", { name: "TPL Bug Report" })).toBeVisible();
});

test("a non-admin cannot open the templates manager", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/admin/templates");
  await expect(page).toHaveURL("/");
});
