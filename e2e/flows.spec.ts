import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

test.beforeEach(async ({ page }) => {
  await useLocale(page, "de");
});

test("admin can create a task end to end", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks/new");
  const title = `E2E Task ${Date.now()}`;
  await page.getByLabel(/Titel/i).fill(title);
  await page.getByRole("button", { name: /Task erstellen|Create task/i }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("regular user does not see admin navigation", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await expect(page.getByRole("link", { name: /Benutzer/i })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Meine Tasks/i })
  ).toBeVisible();
  await page.goto("/admin/users");
  await expect(page).toHaveURL("/");
});
