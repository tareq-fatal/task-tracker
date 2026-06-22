import { test, expect } from "@playwright/test";

test("admin can log in and see the dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Demo-Zugänge / Demo accounts")).toBeVisible();

  await page.getByLabel(/Benutzername/i).fill("admin");
  await page.getByLabel(/Passwort/i).fill("Admin-2026!");
  await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();

  // Redirected to the dashboard
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: /Meine Tasks/i })
  ).toBeVisible();
});

test("admin can open the kanban board with columns", async ({ page }) => {
  // log in first
  await page.goto("/login");
  await page.getByLabel(/Benutzername/i).fill("admin");
  await page.getByLabel(/Passwort/i).fill("Admin-2026!");
  await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/board");
  await expect(page.getByRole("heading", { name: /^Board$/ })).toBeVisible();
  await expect(page.getByText("Zu erledigen")).toBeVisible();
  await expect(page.getByText("In Arbeit")).toBeVisible();
  await expect(page.getByText("Erledigt")).toBeVisible();
});

test("invalid credentials show an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/Benutzername/i).fill("admin");
  await page.getByLabel(/Passwort/i).fill("wrong-password");
  await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();
  await expect(page.getByText(/falsch|Invalid/i)).toBeVisible();
});
