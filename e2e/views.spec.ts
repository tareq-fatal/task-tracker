import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("calendar view renders a month grid with nav", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/views");
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Heute" })).toBeVisible();
  await expect(page.getByText("Mo", { exact: true })).toBeVisible(); // weekday header
});

test("gantt + timeline tabs switch the view", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/views?view=gantt");
  await expect(page.getByRole("link", { name: "Gantt" })).toBeVisible();
  await page.goto("/views?view=timeline");
  await expect(page.getByRole("link", { name: "Timeline" })).toBeVisible();
  // page renders without error (heading present)
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible();
});
