import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("reports page renders KPI cards + charts for admin (de)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Berichte & Auswertungen" })).toBeVisible();
  // v11 infographic dashboard: capture container + heatmap + status donut
  await expect(page.locator("#report-capture")).toBeVisible();
  await expect(page.getByText("Aktivität (Heatmap)")).toBeVisible();
  await expect(page.getByText("Status-Verteilung")).toBeVisible();
});

test("non-admin cannot reach /reports", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/reports");
  await expect(page).toHaveURL("/"); // redirected home
});

test("dashboard shows KPI cards", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/");
  await expect(page.getByText("Diese Woche erledigt")).toBeVisible();
  await expect(page.getByText("Überfällig").first()).toBeVisible();
});

test("task form has a recurrence selector", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks/new");
  await expect(page.locator("select#recurrence")).toBeVisible();
  await expect(page.locator("select#recurrence option")).toHaveCount(4); // none/daily/weekly/monthly
});

test("creating a task records a 'created' activity entry", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks/new");
  await page.locator("#title").fill("v9 activity smoke task");
  await page.getByRole("button", { name: /erstellen|speichern|create|save/i }).click();
  await page.waitForURL(/\/tasks\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Aktivität" })).toBeVisible();
  await expect(page.getByText("hat die Aufgabe erstellt")).toBeVisible();
});

test("admin tasks page shows smart-filter chips", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/tasks");
  await expect(page.getByRole("link", { name: "Meine offenen" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Diese Woche" })).toBeVisible();
});

test("recurring cron endpoint rejects unauthenticated calls", async ({ request }) => {
  const res = await request.get("/api/cron/recurring");
  expect([401, 503]).toContain(res.status());
});
