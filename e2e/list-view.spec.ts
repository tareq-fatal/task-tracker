import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("list view renders, sorts, and bulk-updates a selected task", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/list");
  await expect(page.getByRole("heading", { name: "Listenansicht" })).toBeVisible();
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();
  await page.waitForTimeout(700); // hydrate

  // sortable header (Titel) toggles order without error
  await page.getByRole("button", { name: /Titel/ }).click();
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();

  // select ONE row → bulk toolbar appears
  await page.locator('[data-testid="list-row"] input[type="checkbox"]').first().check();
  await expect(page.getByText(/ausgewählt/)).toBeVisible();

  // bulk set status (reversible) → action runs, selection clears
  await page.getByLabel("Status setzen").selectOption("InProgress");
  await expect(page.getByText(/ausgewählt/)).toHaveCount(0);
});

// Kunden-Report 2026-08, Bug 1: Aufgaben erschienen mehrfach. Regression:
// keine Task-ID darf doppelt gerendert werden — weder in /list noch /admin/tasks.
test("no task id is rendered twice in /list or /admin/tasks", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  await page.goto("/list");
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();
  const listIds = await page
    .locator('[data-testid="list-row"]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-task-id")));
  expect(new Set(listIds).size).toBe(listIds.length);

  await page.goto("/admin/tasks");
  await expect(page.locator('[data-testid="admin-task-row"]').first()).toBeVisible();
  const adminIds = await page
    .locator('[data-testid="admin-task-row"]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-task-id")));
  expect(new Set(adminIds).size).toBe(adminIds.length);
});
