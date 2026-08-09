import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

// Admin user list — the edit dialog must let an admin change a user's DISPLAY
// name (the login username stays fixed and visibly disabled). Renames the
// first editable user and reverts at the end (shared dev DB).
test("admin edits a user's display name via the pencil dialog", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await useLocale(page, "de");
  await page.goto("/admin/users");

  // First row that has a pencil (i.e., not the actor themself).
  const pencil = page.getByTitle("Nutzer bearbeiten").first();
  await expect(pencil).toBeVisible();
  await pencil.click();

  const dialog = page.locator("div.relative.w-full.max-w-sm");
  await expect(dialog).toBeVisible();

  // Username row: labeled + disabled; name row: labeled + editable.
  await expect(dialog.getByText("Benutzername")).toBeVisible();
  await expect(dialog.locator("input[disabled]").first()).toBeVisible();
  await expect(dialog.getByText("Name", { exact: true })).toBeVisible();
  const nameInput = dialog.locator('input[id^="edit-user-name-"]');
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toBeEnabled();

  const oldName = await nameInput.inputValue();
  const probe = `${oldName}-PROBE`;
  await nameInput.fill(probe);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // The list must now show the new name.
  await expect(page.locator("span.truncate.font-medium", { hasText: probe })).toBeVisible({ timeout: 10_000 });

  // Revert (shared dev DB).
  await page.getByTitle("Nutzer bearbeiten").first().click();
  const dialog2 = page.locator("div.relative.w-full.max-w-sm");
  const nameInput2 = dialog2.locator('input[id^="edit-user-name-"]');
  await nameInput2.fill(oldName);
  await dialog2.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog2).toBeHidden({ timeout: 10_000 });
  await expect(page.locator("span.truncate.font-medium", { hasText: probe })).toHaveCount(0);
});
