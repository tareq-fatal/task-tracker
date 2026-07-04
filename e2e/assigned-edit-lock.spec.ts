import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #36 + #39 — a user working an admin-assigned task drives status/comment/timer/
// upload. The content edit affordances are simply absent — NO "read-only" banner,
// no shield, no "you're not allowed" messaging (dignified, not restrictive).
test("assigned task quietly hides edit; status stays available (no read-only banner)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/");
  const taskLink = page.locator('a[href^="/tasks/"]:not([href$="/new"])').first();
  await expect(taskLink).toBeVisible(); // alice has admin-assigned tasks
  await taskLink.click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);

  // the status control IS available (she drives the work)
  await expect(page.getByLabel("Status")).toBeVisible();
  // the edit affordance is simply not there — quietly, no lock/banner
  await expect(page.locator('a[href$="/edit"]')).toHaveCount(0);

  // #39 — no restrictive framing anywhere on the page
  await expect(page.getByText(/nur der Ersteller/)).toHaveCount(0);
  await expect(page.getByText(/read-only|Nur-Lesen/i)).toHaveCount(0);
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
