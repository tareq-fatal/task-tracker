import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Capture utility — run with SHOTS=1. Skipped in the normal suite.
test.describe("v3.0.0 screenshots", () => {
  test.skip(!process.env.SHOTS, "capture-only (set SHOTS=1)");
  test.use({ viewport: { width: 1440, height: 900 } });

  const DIR = "screenshots/v3";
  const shot = async (page: any, name: string) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  };

  test("capture all screens (admin, de)", async ({ page }) => {
    test.setTimeout(240000);

    // 1) login (logged out)
    await page.goto("/login");
    await shot(page, "01-login");

    await login(page, "admin", "Admin-2026!", "de");

    // 2) dashboard (light)
    await page.goto("/");
    await shot(page, "02-dashboard");

    // 3) dashboard (dark) — flip the theme via localStorage + class
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
    });
    await page.goto("/");
    await shot(page, "03-dashboard-dark");
    await page.evaluate(() => {
      localStorage.setItem("theme", "light");
      document.documentElement.classList.remove("dark");
    });

    const routes: [string, string][] = [
      ["/board", "04-board"],
      ["/list", "05-list"],
      ["/views", "06-calendar"],
      ["/views?view=scrum", "07-scrum"],
      ["/roadmap", "08-roadmap"],
      ["/projects", "09-projects"],
      ["/tasks", "12-focus"],
      ["/reports", "13-reports"],
      ["/reports/infographics", "14-infographics"],
      ["/sprints", "15-sprints"],
      ["/admin/users", "16-admin-users"],
      ["/admin/teams", "17-admin-teams"],
      ["/admin/templates", "18-admin-templates"],
      ["/admin/activity", "19-admin-activity"],
      ["/admin/custom-fields", "20-admin-custom-fields"],
      ["/admin/automation", "21-admin-automation"],
      ["/admin/db", "22-admin-db"],
      ["/admin/mandanten", "23-admin-mandanten"],
      ["/settings", "24-settings"],
      ["/settings/branding", "25-branding"],
      ["/settings/integrations", "26-integrations"],
    ];

    // project detail (10) — first project card
    await page.goto("/projects");
    const projHref = await page.locator('a[href^="/projects/"]').first().getAttribute("href");
    if (projHref) {
      await page.goto(projHref);
      await shot(page, "10-project-detail");
    }

    // task detail (11a) + edit (11b) — first board task
    await page.goto("/board");
    const taskHref = await page
      .locator('a[href^="/tasks/"]:not([href$="/new"])')
      .first()
      .getAttribute("href");
    if (taskHref) {
      await page.goto(taskHref);
      await shot(page, "11a-task-detail");
      await page.goto(`${taskHref}/edit`);
      await shot(page, "11b-task-edit");
    }

    for (const [route, name] of routes) {
      await page.goto(route);
      await shot(page, name);
    }

    expect(true).toBe(true);
  });
});
