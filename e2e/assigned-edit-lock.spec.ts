import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #36 — a user working an admin-assigned task may change status/comment/timer/
// upload, but the task content is read-only (no Edit button, no edit form).
test("assigned task is read-only for the assignee (status still changeable)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/");
  const taskLink = page.locator('a[href^="/tasks/"]:not([href$="/new"])').first();
  await expect(taskLink).toBeVisible(); // alice has admin-assigned tasks
  await taskLink.click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);

  // read-only banner is shown, the Edit link is gone
  await expect(page.getByText(/nur der Ersteller/)).toBeVisible();
  await expect(page.locator('a[href$="/edit"]')).toHaveCount(0);

  // but the status control IS available (she may progress the work)
  await expect(page.getByLabel("Status")).toBeVisible();
});

test("assignee cannot open the edit form directly (404)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/");
  const href = await page
    .locator('a[href^="/tasks/"]:not([href$="/new"])')
    .first()
    .getAttribute("href");
  test.skip(!href, "no task to check");
  await page.goto(`${href}/edit`);
  // #36 gate → notFound; Next renders its 404, never the task form
  await expect(page.locator("input#title")).toHaveCount(0);
});
