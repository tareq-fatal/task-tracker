import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("focus tabs switch views, filter by entity, and persist in the URL", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Fokus-Ansicht" })).toBeVisible();

  // Operations tab → "in progress now"
  await page.getByRole("link", { name: "Operationen" }).click();
  await expect(page).toHaveURL(/view=operations/);
  await expect(page.getByText("Läuft gerade")).toBeVisible();

  // Person tab → an entity picker appears
  await page.getByRole("link", { name: "Person", exact: true }).click();
  await expect(page).toHaveURL(/view=person/);
  const picker = page.locator("select");
  await expect(picker).toBeVisible();
  await page.waitForTimeout(600); // hydrate before the onChange navigation

  // picking a person puts the id in the URL (bookmarkable, survives reload)
  await picker.selectOption({ index: 1 });
  await expect(page).toHaveURL(/view=person&id=/);
  const url = page.url();
  await page.reload();
  expect(page.url()).toBe(url); // filter survives refresh
});
