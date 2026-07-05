import { test } from "@playwright/test";
import { login } from "./helpers";

// Arabic capture utility — run with SHOTS=1. Skipped in the normal suite.
test.describe("v3 Arabic screenshots", () => {
  test.skip(!process.env.SHOTS, "capture-only (set SHOTS=1)");
  test.use({ viewport: { width: 1440, height: 900 } });

  const DIR = "screenshots/v3-ar";
  const shot = async (page: any, name: string) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  };

  test("capture key screens in Arabic", async ({ page }) => {
    test.setTimeout(180000);

    // login page is Arabic by default (primary locale)
    await page.goto("/login");
    await shot(page, "01-login");

    await login(page, "admin", "Admin-2026!", "ar");

    const routes: [string, string][] = [
      ["/", "02-dashboard"],
      ["/board", "03-board"],
      ["/list", "04-list"],
      ["/views", "05-calendar"],
      ["/roadmap", "06-roadmap"],
      ["/projects", "07-projects"],
      ["/reports", "08-reports"],
      ["/reports/infographics", "09-infographics"],
      ["/sprints", "10-sprints"],
      ["/admin/users", "11-users"],
      ["/admin/activity", "12-activity"],
      ["/admin/templates", "13-templates"],
      ["/settings", "14-settings"],
    ];

    // task detail (with support tools, assignees, quiet origin footnote)
    await page.goto("/board");
    const taskHref = await page
      .locator('a[href^="/tasks/"]:not([href$="/new"])')
      .first()
      .getAttribute("href");
    if (taskHref) {
      await page.goto(taskHref);
      await shot(page, "15-task-detail");
    }

    for (const [route, name] of routes) {
      await page.goto(route);
      await shot(page, name);
    }
  });
});
