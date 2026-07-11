import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

// The header "New task" button is present on every page and carries the
// `tooltip.new_task` help text — a stable target for these checks.
const NEW_TASK_DE = "Neue Task";
const NEW_TASK_TIP_DE = "Neue Aufgabe anlegen";

test("hovering a button shows its help tooltip after the delay", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/");
  await page.waitForTimeout(500); // hydrate

  // Nothing before hover.
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByRole("link", { name: NEW_TASK_DE }).first().hover();

  // Bubble appears (auto-waits through the ~500ms open delay).
  await expect(page.getByRole("tooltip")).toHaveText(NEW_TASK_TIP_DE);

  // Moving away hides it again.
  await page.mouse.move(5, 5);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("keyboard focus also shows the tooltip (a11y)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/");
  await page.waitForTimeout(500);

  await page.getByRole("link", { name: NEW_TASK_DE }).first().focus();
  await expect(page.getByRole("tooltip")).toHaveText(NEW_TASK_TIP_DE);

  // Escape dismisses it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("the settings toggle disables tooltips for the user", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/settings");
  await page.waitForTimeout(500);

  const sw = page.getByRole("switch", { name: "Tooltips anzeigen" });
  await expect(sw).toHaveAttribute("aria-checked", "true"); // default ON
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");

  // Back on a page with buttons: hovering no longer opens a tooltip.
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.getByRole("link", { name: NEW_TASK_DE }).first().hover();
  await page.waitForTimeout(900);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("RTL: Arabic tooltip renders and is captured", async ({ page }) => {
  await login(page, "admin", "Admin-2026!");
  await useLocale(page, "ar");
  await page.goto("/");
  await page.waitForTimeout(600);

  // Arabic "New task" link → Arabic tooltip.
  await page.getByRole("link", { name: "مهمة جديدة" }).first().hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toHaveText("إنشاء مهمة جديدة");

  await page.screenshot({ path: "screenshots/tooltip-rtl-ar.png", fullPage: false });
});
