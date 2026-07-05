import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

// Global search (Ctrl+K / Cmd+K) — palette opens, finds tenant-scoped results,
// records recents, and hides the People section from non-admins.

const INPUT = /durchsuchen/; // de placeholder

async function openPalette(page: Page) {
  // the header trigger is the most robust way to open (no hydration race)
  await page.getByRole("button", { name: "Suchen" }).first().click();
  await expect(page.getByPlaceholder(INPUT)).toBeVisible();
}

test("admin finds users via palette and lands on the user page", async ({
  page,
}) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.waitForTimeout(1000); // header hydration

  await openPalette(page);
  await page.getByPlaceholder(INPUT).fill("admin");

  // people section appears with the admin account
  await expect(page.getByText("Personen", { exact: true })).toBeVisible({
    timeout: 8000,
  });
  const row = page.locator("button", { hasText: "@admin" }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/);

  // the visited item is now in recents
  await openPalette(page);
  await expect(page.getByText("Zuletzt geöffnet")).toBeVisible();
  await expect(
    page.locator("button", { hasText: "@admin" }).first()
  ).toBeVisible();
});

test("typo still finds the user (fuzzy pool fallback)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.waitForTimeout(1000);

  await openPalette(page);
  await page.getByPlaceholder(INPUT).fill("admn"); // no substring hit anywhere

  await expect(
    page.locator("button", { hasText: "@admin" }).first()
  ).toBeVisible({ timeout: 8000 });
});

test("Ctrl+K opens the palette", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.waitForTimeout(1500); // keydown listener needs hydration

  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(INPUT)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder(INPUT)).toBeHidden();
});

test("non-admin sees no People section", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.waitForTimeout(1000);

  await openPalette(page);
  await page.getByPlaceholder(INPUT).fill("admin");
  await page.waitForTimeout(2000); // debounce + roundtrip

  await expect(page.getByText("Personen", { exact: true })).toBeHidden();
});
