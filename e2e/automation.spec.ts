import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("an automation rule applies on task creation", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  // rule: WHEN task created THEN set priority High
  await page.goto("/admin/automation");
  await expect(async () => {
    await page.getByPlaceholder("Regelname").fill("New tasks are High");
    await page.locator("select").first().selectOption("created");
    // action select (set_priority) is default; pick High in the value select
    await page.locator("select").last().selectOption("High");
    await page.getByRole("button", { name: "Regel hinzufügen" }).click();
    await expect(page.getByTestId("auto-rule").filter({ hasText: "New tasks are High" }).first()).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 20000 });

  // create a task with priority Low → automation flips it to High
  await page.goto("/tasks/new");
  const title = `Auto Task ${Date.now()}`;
  await page.getByLabel(/Titel/i).fill(title);
  await page.selectOption("#priority", "Low");
  await page.getByRole("button", { name: /Task erstellen|Create task/i }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Hoch", { exact: true })).toBeVisible(); // priority badge = High
});

test("a non-admin cannot open automation rules", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/admin/automation");
  await expect(page).toHaveURL("/");
});
