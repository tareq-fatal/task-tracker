import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Live Graph sync needs Azure app credentials on the server. Without them the
// card must render but show the "not configured" notice; the engine logic is
// covered by unit tests (planner-sync.test.ts).
test("tenant admin sees the Planner sync card (not configured without Azure env)", async ({
  page,
}) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/settings");
  await expect(page.getByText("MS Planner Sync")).toBeVisible();
  await expect(
    page.getByText(/Graph-Integration nicht konfiguriert/)
  ).toBeVisible();
});

test("a normal user does NOT see the Planner sync card", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/settings");
  await expect(page.getByText("MS Planner Sync")).toHaveCount(0);
});

test("the sync cron endpoint rejects unauthenticated calls", async ({
  request,
}) => {
  // No SYNC_SECRET configured in the e2e server → 503; if set, 401 without header.
  const res = await request.get("/api/sync/planner");
  expect([401, 503]).toContain(res.status());
});
