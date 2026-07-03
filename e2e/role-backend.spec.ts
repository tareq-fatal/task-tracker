import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("BackendAdmin sees the Backend section + DB console + 🛠️ label", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/");
  await expect(page.getByText("Backend-Admin")).toBeVisible(); // role label
  await expect(page.getByRole("link", { name: /Datenbank/ })).toBeVisible(); // DB console (backend section)
  await expect(page.getByRole("link", { name: /Mandanten/ })).toBeVisible(); // tenant mgmt
  // DB console is reachable for the backend admin
  const r = await page.goto("/admin/db");
  expect(r?.status()).toBeLessThan(400);
});

test("MandantAdmin: no Backend section, blocked from DB console", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de"); // Admin (tenant), not backend
  await page.goto("/");
  await expect(page.getByText("Mandant-Admin")).toBeVisible();
  await expect(page.getByRole("link", { name: /Datenbank/ })).toHaveCount(0); // no DB console
  await page.goto("/admin/db");
  await expect(page).toHaveURL("/"); // blocked
  await page.goto("/admin/tenants");
  await expect(page).toHaveURL("/"); // blocked
});

test("integrations stubs render as not-configured", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { name: "Integrationen" })).toBeVisible();
  await expect(page.getByTestId("integration-card")).toHaveCount(4);
  await expect(page.getByText("Nicht konfiguriert").first()).toBeVisible();
});
