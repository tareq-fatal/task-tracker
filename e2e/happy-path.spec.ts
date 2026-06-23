import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

test.beforeEach(async ({ page }) => {
  await useLocale(page, "de"); // pin German for stable assertions
});

test("admin can log in and see the dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Demo-Zugänge")).toBeVisible();

  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("Admin-2026!");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL("/");
  await useLocale(page, "de");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Meine Tasks/i })
  ).toBeVisible();
});

test("admin can open the kanban board with columns", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  await page.goto("/board");
  await expect(page.getByRole("heading", { name: /^Board$/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Zu erledigen", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "In Arbeit", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Erledigt", exact: true })
  ).toBeVisible();
});

test("invalid credentials show an error", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/falsch|Invalid/i)).toBeVisible();
});
