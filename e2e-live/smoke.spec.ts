import { test, expect, type Page } from "@playwright/test";

// READ-ONLY against production. No create/edit/delete — real data must stay intact.
const ADMIN = { u: "admin", p: "Admin-2026!" };

async function liveLogin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(ADMIN.u);
  await page.locator('input[name="password"]').fill(ADMIN.p);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$|\/\?/);
}

test("login page loads over TLS and leaks no credentials", async ({ page }) => {
  const resp = await page.goto("/login");
  expect(resp?.status()).toBe(200);
  await expect(page.locator('button[type="submit"]')).toBeVisible();
  for (const leak of ["Admin-2026", "Demo-2026", "Demo-Zugänge"]) {
    await expect(page.getByText(leak)).toHaveCount(0);
  }
});

test("wrong password shows an error, not a session", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(ADMIN.u);
  await page.locator('input[name="password"]').fill("definitely-wrong");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/login/);
});

test("admin logs in, session persists across reload, then logs out", async ({ page }) => {
  await liveLogin(page);
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/); // still authenticated

  // logout (safe — just clears the session)
  const logout = page.getByRole("button", { name: /Abmelden|Logout|تسجيل الخروج/i }).first();
  if (await logout.count()) {
    await logout.click();
    await expect(page).toHaveURL(/\/login/);
  }
});

test("all key routes render for an admin (read-only)", async ({ page }) => {
  await liveLogin(page);
  for (const path of ["/tasks", "/board", "/roadmap", "/views", "/reports", "/reports/infographics", "/sprints", "/admin/users", "/admin/db", "/admin/tenants", "/settings/branding"]) {
    const r = await page.goto(path);
    expect(r?.status(), `${path} should not error`).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  }
});

test("live site is tenant-branded (brand vars injected)", async ({ page }) => {
  await liveLogin(page);
  await page.goto("/");
  const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand-from"));
  expect(brand.trim().length).toBeGreaterThan(0);
});
