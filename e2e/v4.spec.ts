import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("admin opens a user detail and performance tab", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/users");

  // open a demo user's detail
  await page.getByRole("link", { name: /alice/i }).first().click();
  await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/);
  await expect(page.getByRole("link", { name: "Aufgaben" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Leistung" })).toBeVisible();

  // switch to performance tab
  await page.getByRole("link", { name: "Leistung" }).click();
  await expect(page).toHaveURL(/\/performance$/);
  await expect(page.getByText(/Produktivität/)).toBeVisible();
  await expect(page.getByText("Erledigte Aufgaben")).toBeVisible();
});

test("admin creates a team and adds a member", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/teams");

  await page.getByRole("button", { name: "Neues Team" }).first().click();
  const name = `QA ${Date.now()}`;
  await page.getByLabel(/Name/i).fill(name);
  await page.getByRole("button", { name: "Team erstellen" }).click();

  // lands on the new team detail
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/Mitglieder \(0\)/)).toBeVisible();

  // add the first candidate member
  await page.locator('select[name="userId"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  await expect(page.getByText(/Mitglieder \(1\)/)).toBeVisible();
});
