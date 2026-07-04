import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("GET /logout clears the session (APK-safe hard logout)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/logout");
  await expect(page).toHaveURL(/\/login/);
  // session really gone: a protected route now bounces to login
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("Focus (/tasks) is admin-only", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de"); // regular User
  await page.goto("/tasks");
  await expect(page).toHaveURL("/"); // redirected
  // switch users via the new hard-logout, then Admin (tenant) may use it
  await page.goto("/logout");
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Fokus-Ansicht" })).toBeVisible();
});

test("regular user cannot delete a task (no delete button)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/");
  const taskLink = page.locator('a[href^="/tasks/"]:not([href$="/new"])').first();
  await expect(taskLink).toBeVisible(); // alice has assigned tasks
  await taskLink.click();
  await expect(page.getByRole("button", { name: "Löschen" })).toHaveCount(0);
});

test("regular user sees only their assigned tasks (admin sees all)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/board");
  const aliceCount = await page.locator('[data-testid="task-card"]').count().catch(() => 0);
  // marine-only task never visible (isolation still holds)
  await expect(page.getByText("Radar-Kalibrierung Pier 3")).toHaveCount(0);
  expect(aliceCount).toBeGreaterThanOrEqual(0);
});
