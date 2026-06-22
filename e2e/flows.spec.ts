import { test, expect } from "@playwright/test";

async function login(page: any, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/Benutzername/i).fill(username);
  await page.getByLabel(/Passwort/i).fill(password);
  await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();
  await expect(page).toHaveURL("/");
}

test("admin can create a task end to end", async ({ page }) => {
  await login(page, "admin", "Admin-2026!");
  await page.goto("/tasks/new");
  const title = `E2E Task ${Date.now()}`;
  await page.getByLabel(/Titel/i).fill(title);
  await page.getByRole("button", { name: /Task erstellen|Create task/i }).click();
  // lands on the task detail page
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("regular user does not see admin navigation", async ({ page }) => {
  await login(page, "alice", "Demo-2026!");
  // Admin-only links must be absent
  await expect(page.getByRole("link", { name: /Benutzer/i })).toHaveCount(0);
  // Dashboard heading is visible
  await expect(
    page.getByRole("heading", { name: /Meine Tasks/i })
  ).toBeVisible();
  // Direct access to an admin route is redirected away
  await page.goto("/admin/users");
  await expect(page).toHaveURL("/");
});
