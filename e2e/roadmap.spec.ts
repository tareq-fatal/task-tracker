import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("roadmap renders lanes with a quarter axis", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/roadmap");
  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
  await expect(page.locator('[data-testid="roadmap-lane"]').first()).toBeVisible();
  await expect(page.getByText(/Q[1-4] 20\d\d/).first()).toBeVisible(); // quarter tick
});

test("roadmap is reachable by a regular user", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/roadmap");
  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
});
