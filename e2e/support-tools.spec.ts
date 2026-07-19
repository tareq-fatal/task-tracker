import { test, expect } from "@playwright/test";
import { login } from "./helpers";

async function newTask(page: import("@playwright/test").Page, title: string) {
  await page.goto("/tasks/new");
  await page.locator("#title").fill(title);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => /\/tasks\//.test(u.pathname) && !u.pathname.endsWith("/new"));
}

// The escalation-support feature (#24) was removed on customer request —
// this spec now asserts its UI is really gone from the task detail.
test("task detail has no escalation banner or admin support tools", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Keine Eskalation ${Date.now()}`);
  await expect(page.getByText("Admin-Support")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Eskalieren/ })).toHaveCount(0);
  await expect(page.getByText(/Eskalierte Aufgabe/)).toHaveCount(0);
  await expect(page.getByPlaceholder(/Tipp oder Anleitung/)).toHaveCount(0);
});
