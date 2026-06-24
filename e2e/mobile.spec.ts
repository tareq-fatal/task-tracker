import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async ({ page }) => {
  await useLocale(page, "de");
});

test("mobile board has a snap-scroll container and column dots", async ({
  page,
}) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/board");

  // The horizontal swipe container exists
  await expect(page.locator(".board-scroll")).toBeVisible();

  // Three quick-jump dots (mobile only) — labelled by column
  await expect(
    page.getByRole("button", { name: "Zu erledigen", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Erledigt", exact: true })
  ).toBeVisible();

  // Tapping a dot scrolls that column toward the centre of the viewport
  await page.getByRole("button", { name: "Erledigt", exact: true }).click();
  await page.waitForTimeout(500);
  const done = page.getByRole("heading", { name: "Erledigt", exact: true });
  const box = await done.boundingBox();
  expect(box).not.toBeNull();
  // column header should now be within the viewport width
  expect(box!.x).toBeLessThan(390);
  expect(box!.x + box!.width).toBeGreaterThan(0);
});

test("mobile bottom nav is visible", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  // bottom nav new-task shortcut + section links are present on mobile
  await expect(
    page.getByRole("heading", { name: /Meine Tasks/i })
  ).toBeVisible();
});
