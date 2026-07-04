import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #33 — tenant-wide activity feed, admin-only.
test("admin can open the activity feed", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/activity");
  await expect(page.getByRole("heading", { name: "Aktivitäts-Feed" })).toBeVisible();
  // the per-user filter is present
  await expect(page.getByLabel("Nach Nutzer filtern")).toBeVisible();
});

test("a regular user cannot reach the activity feed", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/admin/activity");
  await expect(page).toHaveURL("/"); // redirected away
});

// #13 — admins can add co-assignees; the edit form exposes the picker.
test("admin edit form offers co-assignees + a primary (Hauptkopf)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/board");
  const taskLink = page.locator('a[href^="/tasks/"]:not([href$="/new"])').first();
  await expect(taskLink).toBeVisible();
  await taskLink.click();
  await page.locator('a[href$="/edit"]').first().click();
  await expect(page).toHaveURL(/\/edit$/);

  // primary (Hauptkopf) select + additional-assignee checkboxes both present
  await expect(page.getByLabel("Hauptkopf (verantwortlich)")).toBeVisible();
  await expect(page.getByText("Weitere Zuständige")).toBeVisible();
  await expect(page.locator('input[name="assigneeIds"]').first()).toBeVisible();
});
