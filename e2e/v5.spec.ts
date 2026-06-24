import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("desktop filters", () => {
  test("priority filter syncs to URL, shows a chip, and resets", async ({
    page,
  }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/admin/tasks");

    // the priority <select> is the one containing the "Kritisch" option
    const prioritySelect = page.locator("select", {
      has: page.locator('option', { hasText: "Kritisch" }),
    });
    await prioritySelect.selectOption("Critical");

    // URL sync
    await expect(page).toHaveURL(/priority=Critical/);
    // removable chip
    await expect(
      page.getByRole("button", { name: "Kritisch" })
    ).toBeVisible();
    // result counter present
    await expect(page.getByText(/von \d+\)/)).toBeVisible();

    // reset
    await page.getByRole("button", { name: /Zurücksetzen/ }).click();
    await expect(page).toHaveURL(/\/admin\/tasks$/);
    await expect(
      page.getByRole("button", { name: "Kritisch" })
    ).toHaveCount(0);
  });

  test("status group filter narrows to completed", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/admin/tasks");
    const statusSelect = page.locator("select", {
      has: page.locator('option', { hasText: "Abgeschlossen" }),
    });
    await statusSelect.selectOption("done");
    await expect(page).toHaveURL(/status=done/);
    await expect(
      page.getByRole("button", { name: "Abgeschlossen" })
    ).toBeVisible();
  });
});

test.describe("mobile filters", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("filter modal opens on mobile", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/admin/tasks");
    await page.getByRole("button", { name: /Filter/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anwenden" })).toBeVisible();
  });
});
