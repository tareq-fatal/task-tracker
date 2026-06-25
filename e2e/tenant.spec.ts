import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("tenant isolation: a tenant user only sees their tenant's data", async ({
  page,
}) => {
  await login(page, "tarek", "Demo-2026!", "de");

  // Sees own-tenant task...
  await expect(
    page.getByText("Website-Domain verlängern")
  ).toBeVisible();

  // ...and on the admin task list, only the 3 tarek-tenant tasks (von 3)
  await page.goto("/admin/tasks");
  await expect(page.getByText("Steuerunterlagen 2025 sortieren")).toBeVisible();
  await expect(page.getByText(/von 3\)/)).toBeVisible();

  // ...never the Objektus or Marine data
  await expect(page.getByText("Radar-Kalibrierung Pier 3")).toHaveCount(0);
  await expect(page.getByText("إعادة تصميم الصفحة الرئيسية")).toHaveCount(0);
});

test("a tenant user cannot switch tenants via /t/{slug}", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/t/marine"); // attempt to jump to another tenant
  await expect(page).toHaveURL("/"); // redirected home, still tarek
  await page.goto("/admin/tasks");
  await expect(page.getByText("Steuerunterlagen 2025 sortieren")).toBeVisible();
  await expect(page.getByText("Radar-Kalibrierung Pier 3")).toHaveCount(0);
});

test("super-admin can switch tenants and sees that tenant's data", async ({
  page,
}) => {
  await login(page, "admin", "Admin-2026!", "de");

  // switch to Marine
  await page.goto("/t/marine");
  await expect(page).toHaveURL("/");
  await page.goto("/admin/tasks");
  await expect(page.getByText("Radar-Kalibrierung Pier 3")).toBeVisible();
  await expect(page.getByText("Steuerunterlagen 2025 sortieren")).toHaveCount(0);

  // switch back to Objektus (search to avoid the 200-row table cap)
  await page.goto("/t/objektus");
  await page.goto(`/admin/tasks?q=${encodeURIComponent("إعادة تصميم")}`);
  await expect(page.getByText("إعادة تصميم الصفحة الرئيسية")).toBeVisible();
  // Marine data never leaks into Objektus, even when searching for it
  await page.goto("/admin/tasks?q=Radar-Kalibrierung");
  await expect(page.getByText("Radar-Kalibrierung Pier 3")).toHaveCount(0);
});
