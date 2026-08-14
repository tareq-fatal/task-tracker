import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

// Mandanten list — a BackendAdmin can rename a Mandant (display name only);
// the slug field stays locked. Renames the first Mandant and reverts at the
// end (shared dev DB).
test("backend admin renames a Mandant, the slug stays locked", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await useLocale(page, "de");
  await page.goto("/admin/mandanten");

  const row = page.locator('[data-testid="tenant-row"]').first();
  await expect(row).toBeVisible();
  const oldName = (await row.locator("span.font-medium").first().innerText()).trim();
  const slug = (await row.locator("code").innerText()).trim().replace(/^\//, "");
  const probe = `${oldName}-RENAME-PROBE`;

  async function rename(to: string) {
    await row.locator('[data-testid="rename-tenant"]').click();
    const input = page.locator("#rename-tenant-name");
    await expect(input).toBeVisible();
    await input.fill(to);
    await page.locator('[data-testid="rename-tenant-save"]').click();
    await expect(input).toBeHidden({ timeout: 10_000 });
    // exact match — the probe name contains the old one as a substring
    await expect(row.locator("span.font-medium").first()).toHaveText(to, { timeout: 10_000 });
  }

  // dialog: slug is visible but not editable, empty name blocks save
  await row.locator('[data-testid="rename-tenant"]').click();
  await expect(page.locator("#rename-tenant-slug")).toBeDisabled();
  await page.locator("#rename-tenant-name").fill("");
  await expect(page.locator('[data-testid="rename-tenant-save"]')).toBeDisabled();
  await page.keyboard.press("Escape");

  await rename(probe);

  // the new name survives a reload, the slug is untouched
  await page.reload();
  await expect(row.locator("span.font-medium").first()).toHaveText(probe);
  await expect(row.locator("code")).toHaveText(`/${slug}`);

  // revert
  await rename(oldName);
});
