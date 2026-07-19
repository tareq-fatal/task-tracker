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

test("mobile has ONE nav: 4 tabs + Mehr, no hamburger drawer", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  // the old hamburger menu is gone — bottom nav is the only mobile nav
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);

  const bottom = page.locator("nav.fixed.bottom-0");
  await expect(bottom).toBeVisible();
  // exactly 5 slots: 4 primary views + Mehr (iOS/Android tab-bar standard)
  await expect(bottom.locator("a, button")).toHaveCount(5);
  await expect(bottom.getByRole("button", { name: "Mehr" })).toBeVisible();

  // Mehr opens the sheet with the secondary items (Zeitleiste, Projekte, …)
  await bottom.getByRole("button", { name: "Mehr" }).click();
  await expect(page.getByRole("link", { name: "Zeitleiste" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Projekte" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Einstellungen" })).toBeVisible();
});
