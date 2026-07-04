import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #26 — admins grant/revoke project access; members then see all project tasks.
test("admin can add and remove a project member", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/projects");

  // open the first project
  await page.locator('a[href^="/projects/"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);

  // the admin-only members panel is present
  await expect(page.getByRole("heading", { name: "Projekt-Mitglieder" })).toBeVisible();

  // pick bob from the candidate picker (by its @username in the option text)
  const picker = page.getByLabel("Mitglied hinzufügen");
  const bobValue = await page
    .locator("select option", { hasText: "@bob" })
    .first()
    .getAttribute("value");
  test.skip(!bobValue, "bob already a member — nothing to add");
  await picker.selectOption(bobValue!);
  await page.getByRole("button", { name: "Hinzufügen" }).click();

  // a remove chip for the new member appears
  const removeChip = page.getByRole("button", { name: /Entfernen:/ });
  await expect(removeChip.first()).toBeVisible();

  // remove them again — chip disappears
  const before = await removeChip.count();
  await removeChip.first().click();
  await expect(removeChip).toHaveCount(before - 1);
});

test("a regular user never sees the members panel", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/projects");
  const cards = page.locator('a[href^="/projects/"]');
  const n = await cards.count();
  test.skip(n === 0, "user has no visible projects");
  await cards.first().click();
  await expect(page.getByRole("heading", { name: "Projekt-Mitglieder" })).toHaveCount(0);
});
