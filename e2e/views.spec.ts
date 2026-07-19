import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("calendar view renders a month grid with nav", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/views");
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Heute" })).toBeVisible();
  await expect(page.getByText("Mo", { exact: true })).toBeVisible(); // weekday header
});

test("old gantt/timeline calendar tabs redirect to the timeline view", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  // The calendar page no longer hosts its own gantt/timeline copies — the
  // consolidated /gantt (Zeitleiste) owns them, roadmap included as a tab.
  await page.goto("/views?view=gantt");
  await expect(page).toHaveURL(/\/gantt/);
  await page.goto("/views?view=timeline");
  await expect(page).toHaveURL(/\/gantt/);
  await expect(page.getByRole("link", { name: "Roadmap" }).first()).toBeVisible();
});
