import { chromium } from "@playwright/test";

const BASE = "http://localhost:3100";
const OUT = "screenshots/v10";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 850 },
  deviceScaleFactor: 2,
});
await ctx.addCookies([
  { name: "tt_locale", value: "en", url: BASE },
]);
const page = await ctx.newPage();

// 1) Login (logged out)
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/login.png` });
console.log("shot: login");

// 2) Log in as admin
await page.fill("#username", "admin");
await page.fill("#password", "Admin-2026!");
await page.locator('button[type="submit"]').click();
await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/dashboard.png` });
console.log("shot: dashboard");

// 3) Board
await page.goto(`${BASE}/board`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/board.png` });
console.log("shot: board");

await browser.close();
console.log("done");
