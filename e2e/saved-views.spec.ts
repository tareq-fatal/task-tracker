import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("save a focus view, recall it, and it persists across reloads", async ({ page }) => {
  const name = `Ops ${Date.now()}`; // unique — saved views persist per user across runs
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks?view=operations");
  await page.waitForTimeout(700); // hydrate

  // open the save control, name it, save
  await page.getByRole("button", { name: "Ansicht speichern" }).click();
  await page.getByPlaceholder("Name…").fill(name);
  await page.getByRole("button", { name: "Ansicht speichern" }).click();

  const chip = page.getByTestId("saved-view").filter({ hasText: name });
  await expect(chip).toBeVisible();

  // persists after reload (stored per user in the DB)
  await page.reload();
  await expect(page.getByTestId("saved-view").filter({ hasText: name })).toBeVisible();

  // recall navigates back to the saved view
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/view=operations/);
});
