import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("admin defines a custom field and sets its value on a task", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  // 1) define a text field "Risk" (retry guards the hydration race; .first()
  //    keeps it safe if a retry adds a duplicate)
  await page.goto("/admin/custom-fields");
  await expect(async () => {
    await page.getByPlaceholder("Feldname").fill("Risk");
    await page.getByRole("button", { name: "Feld hinzufügen" }).click();
    await expect(page.getByTestId("cf-def").filter({ hasText: "Risk" }).first()).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 20000 });

  // 2) the field shows on a task and a value persists
  await page.goto("/admin/tasks");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page.getByRole("heading", { name: "Eigene Felder" })).toBeVisible();

  const input = page.locator('section:has(h2:has-text("Eigene Felder")) input[type="text"]').first();
  await input.fill("High");
  await input.blur();
  await page.waitForTimeout(800); // let the server action + refresh settle

  await page.reload();
  await expect(page.locator('section:has(h2:has-text("Eigene Felder")) input[type="text"]').first()).toHaveValue("High");
});

test("a non-admin cannot open the custom-fields manager", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/admin/custom-fields");
  await expect(page).toHaveURL("/");
});
