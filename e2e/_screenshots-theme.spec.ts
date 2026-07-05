import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

// Theme-QA capture — every major screen in light AND dark. Run with SHOTS=1.
// Output: screenshots/theme/<nn>-<name>.png / <nn>-<name>-dark.png
test.describe("theme screenshots (light + dark)", () => {
  test.skip(!process.env.SHOTS, "capture-only (set SHOTS=1)");
  test.use({ viewport: { width: 1440, height: 900 } });

  const DIR = "screenshots/theme";

  async function setTheme(page: Page, dark: boolean) {
    await page.evaluate((d) => {
      localStorage.setItem("theme", d ? "dark" : "light");
      document.documentElement.classList.toggle("dark", d);
    }, dark);
  }

  async function shot(page: Page, name: string) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  }

  /** Capture a route in light and dark; reloads so charts repaint themed. */
  async function shotBoth(page: Page, route: string, name: string) {
    await setTheme(page, false);
    await page.goto(route);
    await shot(page, name);
    await setTheme(page, true);
    await page.goto(route);
    await shot(page, `${name}-dark`);
    await setTheme(page, false);
  }

  test("capture all screens light+dark (admin, de)", async ({ page }) => {
    test.setTimeout(600_000);

    // login (logged out)
    await page.goto("/login");
    await shot(page, "01-login");
    await setTheme(page, true);
    await page.goto("/login");
    await shot(page, "01-login-dark");
    await setTheme(page, false);

    await login(page, "admin", "Admin-2026!", "de");

    // Dismiss the welcome tour (fresh seed → hasSeenTour=false) so the
    // Joyride overlay doesn't dim every capture. The tour mounts ~700ms
    // after the layout, so wait for the button instead of polling count().
    try {
      await page
        .getByRole("button", { name: "Überspringen" })
        .click({ timeout: 8000 });
      await page.waitForTimeout(1200); // let completeTourAction persist
    } catch {
      /* tour already completed in a previous run */
    }

    const routes: [string, string][] = [
      ["/", "02-dashboard"],
      ["/board", "03-board"],
      ["/list", "04-list"],
      ["/views", "05-calendar"],
      ["/views?view=scrum", "06-scrum"],
      ["/views?view=insights", "07-insights"],
      ["/roadmap", "08-roadmap"],
      ["/projects", "09-projects"],
      ["/tasks", "10-focus"],
      ["/reports", "11-reports"],
      ["/reports/infographics", "12-infographics"],
      ["/sprints", "13-sprints"],
      ["/admin/users", "14-admin-users"],
      ["/admin/teams", "15-admin-teams"],
      ["/admin/templates", "16-admin-templates"],
      ["/admin/activity", "17-admin-activity"],
      ["/admin/custom-fields", "18-admin-custom-fields"],
      ["/admin/automation", "19-admin-automation"],
      ["/admin/db", "20-admin-db"],
      ["/admin/mandanten", "21-admin-mandanten"],
      ["/settings", "22-settings"],
      ["/settings/branding", "23-branding"],
      ["/settings/integrations", "24-integrations"],
      ["/tasks/new", "25-new-task"],
    ];
    for (const [route, name] of routes) {
      await shotBoth(page, route, name);
    }

    // task detail — first board task
    await page.goto("/board");
    const taskHref = await page
      .locator('a[href^="/tasks/"]:not([href$="/new"])')
      .first()
      .getAttribute("href");
    if (taskHref) {
      await shotBoth(page, taskHref, "26-task-detail");
    }

    expect(true).toBe(true);
  });
});
