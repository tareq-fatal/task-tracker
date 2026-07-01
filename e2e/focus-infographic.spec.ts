import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("focus tabs expose context infographic buttons that open the generator", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  // "All" tab → tenant overview button
  await page.goto("/tasks?view=all");
  const allBtn = page.getByTestId("make-infographic");
  await expect(allBtn).toBeVisible();
  await expect(allBtn).toContainText("Gesamtübersicht");

  // Project tab → pick a project → per-project infographic button → generator
  await page.goto("/tasks?view=project");
  await page.waitForTimeout(700); // hydrate the picker
  await page.locator("select").selectOption({ index: 1 });
  await expect(page).toHaveURL(/view=project&id=/);

  const projBtn = page.getByTestId("make-infographic");
  await expect(projBtn).toBeVisible();
  await projBtn.click();
  await expect(page).toHaveURL(/\/reports\/infographics\?type=project&id=/);
  // the branded generator renders (export controls present)
  await expect(page.getByRole("button", { name: /PNG/i })).toBeVisible();
});

test("a regular user does not see the infographic buttons", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/tasks?view=all");
  await expect(page.getByTestId("make-infographic")).toHaveCount(0);
});
