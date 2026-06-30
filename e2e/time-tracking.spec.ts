import { test, expect } from "@playwright/test";
import { login } from "./helpers";

async function newTask(page: import("@playwright/test").Page, title: string) {
  await page.goto("/tasks/new");
  await page.locator("#title").fill(title);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => /\/tasks\//.test(u.pathname) && !u.pathname.endsWith("/new"));
}

test("manual time entry is logged with a formatted total", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Time ${Date.now()}`);
  await expect(page.getByText("Zeiterfassung")).toBeVisible();
  const timeForm = page.locator('form:has(input[name="duration"])');
  await timeForm.locator('input[name="duration"]').fill("1h30m");
  await timeForm.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("1h 30m").first()).toBeVisible();
});

test("starting a timer shows a running timer in the header", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Run ${Date.now()}`);
  await page.getByRole("button", { name: /Timer starten/i }).click();
  await expect(page.getByRole("button", { name: /^Stopp$/ })).toBeVisible();
  // header shows a stop control (the running-timer pill)
  await expect(page.getByRole("button", { name: "stop timer" })).toBeVisible();
});
