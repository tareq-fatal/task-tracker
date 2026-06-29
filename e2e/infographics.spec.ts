import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("reports page is the infographic dashboard (hero + KPIs + export)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Berichte & Auswertungen" })).toBeVisible();
  // hero capture container + export + heatmap section
  await expect(page.locator("#report-capture")).toBeVisible();
  await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
  await expect(page.getByText("Aktivität (Heatmap)")).toBeVisible();
  await expect(page.getByText("Status-Verteilung")).toBeVisible();
});

test("infographics page renders a selectable entity infographic", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/reports/infographics");
  await expect(page.getByRole("heading", { name: "Infografiken" })).toBeVisible();
  // type tabs + range selector present
  await expect(page.getByRole("button", { name: "Projekt" })).toBeVisible();
  await expect(page.locator("#infographic-capture")).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
});

test("non-admin cannot reach infographics", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/reports/infographics");
  await expect(page).toHaveURL("/");
});
