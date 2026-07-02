import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("insights page renders the predictive panels", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/reports/insights");
  await expect(page.getByRole("heading", { name: "Insights & Prognosen" })).toBeVisible();
  await expect(page.getByText("Erledigt diese Woche")).toBeVisible(); // trend hero
  // at least one predictive card is present
  await expect(page.getByText(/Sprint-Prognose|Engpass|Auslastungs-Warnung|Aufwand vs\. Realität/).first()).toBeVisible();
});

test("a non-admin cannot open insights", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/reports/insights");
  await expect(page).toHaveURL("/");
});
