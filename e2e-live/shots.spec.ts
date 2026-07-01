import { test, type Page } from "@playwright/test";

const DIR = "C:/Users/sapb1/AppData/Local/Temp/claude/C--Users-sapb1-source/bfffc4fb-af79-4690-817c-3a851c52c340/scratchpad/live-shots";

async function liveLogin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("Admin-2026!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/$|\/\?/);
}

test("capture main screens", async ({ page }) => {
  await page.goto("/login");
  await page.screenshot({ path: `${DIR}/01-login.png`, fullPage: true });

  await liveLogin(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/02-dashboard.png`, fullPage: true });

  for (const [name, path] of [
    ["03-board", "/board"],
    ["04-focus", "/tasks?view=all"],
    ["05-roadmap", "/roadmap"],
    ["06-reports", "/reports"],
    ["07-infographic", "/reports/infographics"],
    ["08-branding", "/settings/branding"],
    ["09-dbconsole", "/admin/db"],
    ["10-tenants", "/admin/tenants"],
  ] as const) {
    await page.goto(path);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  }
});
