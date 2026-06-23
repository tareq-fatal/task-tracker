import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

const PORT = process.env.E2E_PORT ?? "3100";
const base = `http://localhost:${PORT}`;
const out = "screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function loginFlow(page) {
  await page.goto(`${base}/login`);
  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("Admin-2026!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(base + "/");
  await page.waitForTimeout(500);
}

// Desktop — Arabic (default, RTL)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/01-login.png` });
await loginFlow(page);
await page.screenshot({ path: `${out}/02-dashboard.png`, fullPage: true });
await page.goto(`${base}/board`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03-board.png` });
await page.goto(`${base}/projects`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/04-projects.png` });

// Task detail (progress control + subtasks + timer)
await page.goto(`${base}/board`);
await page.waitForTimeout(400);
await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
await page.waitForURL(/\/tasks\/[^/]+$/);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/09-task-detail.png`, fullPage: true });
await page.goto(`${base}/admin/tasks`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05-admin-tasks.png` });

// Mobile — Arabic (default, RTL)
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
});
const mpage = await mctx.newPage();
await loginFlow(mpage);
await mpage.screenshot({ path: `${out}/06-mobile-dashboard.png`, fullPage: true });
await mpage.goto(`${base}/board`);
await mpage.waitForTimeout(500);
await mpage.screenshot({ path: `${out}/07-mobile-board.png` });

// Desktop — English (LTR) to show the language switch
const ectx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ectx.addCookies([{ name: "tt_locale", value: "en", url: base }]);
const epage = await ectx.newPage();
await loginFlow(epage);
await ectx.addCookies([{ name: "tt_locale", value: "en", url: base }]);
await epage.goto(`${base}/board`);
await epage.waitForTimeout(500);
await epage.screenshot({ path: `${out}/08-board-en-ltr.png` });

await browser.close();
console.log("screenshots written to", out);
