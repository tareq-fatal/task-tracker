import { test, expect } from "@playwright/test";
import { login } from "./helpers";

async function newTask(page: import("@playwright/test").Page, title: string) {
  await page.goto("/tasks/new");
  await page.locator("#title").fill(title);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => /\/tasks\//.test(u.pathname) && !u.pathname.endsWith("/new"));
}

test("weekly timesheet shows a logged entry with billable toggle", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const title = `Sheet ${Date.now()}`;
  await newTask(page, title);
  const timeForm = page.locator('form:has(input[name="duration"])');
  await timeForm.locator('input[name="duration"]').fill("2h");
  await timeForm.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("2h").first()).toBeVisible();

  await page.goto("/time");
  await expect(page.getByRole("heading", { name: "Wochen-Timesheet" })).toBeVisible();
  await expect(page.getByText("Stundennachweis")).toBeVisible();
  // the task appears in the week grid with its total
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  // billable toggle is present in the day detail list
  await expect(page.getByRole("button", { name: "Abrechenbar umschalten" }).first()).toBeVisible();
});

test("time report groups logged time and filters billable", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/reports/time");
  await expect(page.getByRole("heading", { level: 1, name: "Zeit-Reports" })).toBeVisible();
  // group-by switch + billable filter are rendered
  await expect(page.getByRole("combobox", { name: "Gruppieren nach" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nicht abrechenbar" })).toBeVisible();
});

test("pomodoro starts a 25-minute focus countdown in the header", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Pomo ${Date.now()}`);
  await page.getByRole("button", { name: /Pomodoro/ }).click();
  // header pill: cycle badge ×1 and a 24:xx countdown
  await expect(page.getByText("×1")).toBeVisible();
  await expect(page.getByText(/^24:[0-5]\d$/)).toBeVisible();
  // stopping the pomodoro clears the pill
  await page.getByRole("button", { name: "Pomodoro beenden" }).click();
  await expect(page.getByText("×1")).toHaveCount(0);
});
