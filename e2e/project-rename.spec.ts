import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

// Project page — admins can rename a project (name + description) via the
// edit dialog; header and project list must show the new name. Renames the
// first project and reverts at the end (shared dev DB).
test("admin renames a project via the edit dialog", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await useLocale(page, "de");
  await page.goto("/projects");

  // open the first project card
  await page.locator('a[href^="/projects/"]').first().click();
  await page.waitForURL(/\/projects\/[a-z0-9]+/);
  const oldName = (await page.locator("h1").first().innerText()).trim();
  const probe = `${oldName}-RENAME-PROBE`;

  async function rename(to: string) {
    await page.getByRole("button", { name: "Projekt bearbeiten" }).click();
    const nameInput = page.locator("#edit-project-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill(to);
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.locator("#edit-project-name")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("h1").first()).toHaveText(to, { timeout: 10_000 });
  }

  // empty name keeps save disabled
  await page.getByRole("button", { name: "Projekt bearbeiten" }).click();
  await page.locator("#edit-project-name").fill("");
  await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await rename(probe);

  // list shows the new name
  await page.goto("/projects");
  await expect(page.getByText(probe).first()).toBeVisible();

  // revert
  await page.locator('a[href^="/projects/"]', { hasText: probe }).first().click();
  await page.waitForURL(/\/projects\/[a-z0-9]+/);
  await rename(oldName);
});
