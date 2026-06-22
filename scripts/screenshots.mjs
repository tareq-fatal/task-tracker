import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

const PORT = process.env.E2E_PORT ?? "3100";
const base = `http://localhost:${PORT}`;
const out = "screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

// Desktop
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.screenshot({ path: `${out}/01-login.png` });
await page.getByLabel(/Benutzername/i).fill("admin");
await page.getByLabel(/Passwort/i).fill("Admin-2026!");
await page.getByRole("button", { name: /Anmelden|Sign in/i }).click();
await page.waitForURL(base + "/");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/02-dashboard.png`, fullPage: true });
await page.goto(`${base}/board`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03-board.png` });
await page.goto(`${base}/projects`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/04-projects.png` });
await page.goto(`${base}/admin/tasks`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05-admin-tasks.png` });

// Mobile
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
});
const mpage = await mctx.newPage();
await mpage.goto(`${base}/login`);
await mpage.getByLabel(/Benutzername/i).fill("admin");
await mpage.getByLabel(/Passwort/i).fill("Admin-2026!");
await mpage.getByRole("button", { name: /Anmelden|Sign in/i }).click();
await mpage.waitForURL(base + "/");
await mpage.waitForTimeout(500);
await mpage.screenshot({ path: `${out}/06-mobile-dashboard.png`, fullPage: true });
await mpage.goto(`${base}/board`);
await mpage.waitForTimeout(500);
await mpage.screenshot({ path: `${out}/07-mobile-board.png` });

await browser.close();
console.log("screenshots written to", out);
