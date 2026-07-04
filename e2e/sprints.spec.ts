import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("admin can open the sprints page and create a sprint", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/sprints");
  await expect(page.getByRole("heading", { name: "Sprints / Cycles" })).toBeVisible();
  await expect(page.getByText("Burndown")).toBeVisible();
  await expect(page.getByText(/Velocity/)).toBeVisible();

  // create a sprint
  await page.locator('input[name="name"]').fill("Sprint Alpha");
  await page.getByRole("button", { name: "Anlegen" }).click();
  // (this spec re-runs against a persistent dev DB, so ≥1 "Sprint Alpha" may exist)
  await expect(page.getByText("Sprint Alpha").first()).toBeVisible();
});

test("non-admin cannot reach /sprints", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/sprints");
  await expect(page).toHaveURL("/");
});
