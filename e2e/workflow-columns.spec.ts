import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("admin applies a template and adds a custom workflow column", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // auto-accept replace-confirm

  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/projects");
  await page.locator('a[href^="/projects/"]').first().click();
  await page.getByRole("link", { name: "Workflow bearbeiten" }).click();
  await expect(page.getByRole("heading", { name: "Workflow-Spalten" })).toBeVisible();

  // apply the Kanban 3 template → 3 columns. Re-applying is idempotent (always
  // yields the template's columns), so retry the click until hydration catches it.
  await expect(async () => {
    await page.getByRole("button", { name: /Kanban 3/ }).click();
    await expect(page.locator('[data-testid="wf-col"]')).toHaveCount(3, { timeout: 2500 });
  }).toPass({ timeout: 20000 });

  // a WIP limit from the template is shown (Doing = 3)
  await expect(page.locator('input[type="number"]').nth(1)).toHaveValue("3");

  // add a custom column → 4 columns
  await page.getByPlaceholder("Spaltenname").fill("Review");
  await page.getByRole("button", { name: "Spalte hinzufügen" }).click();
  await expect(page.locator('[data-testid="wf-col"]')).toHaveCount(4);
});

test("a non-admin cannot open the workflow editor", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  // grab a project id as alice (she can see projects)
  await page.goto("/projects");
  const href = await page.locator('a[href^="/projects/"]').first().getAttribute("href");
  await page.goto(`${href}/workflow`);
  await expect(page).toHaveURL("/"); // redirected away
});
