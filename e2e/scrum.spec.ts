import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("scrum board shows the six sticky columns + tools", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/views?view=scrum");
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible();
  for (const col of ["To Do", "In Arbeit", "Wartend", "Bewertung", "Fertig / Live", "Bereit für Go-Live"]) {
    await expect(page.getByText(col).first()).toBeVisible();
  }
  // whiteboard toggle + live presence
  await expect(page.getByRole("button", { name: /Zeichnen/ })).toBeVisible();
  await expect(page.getByText(/live/).first()).toBeVisible();
});

test("scrum tab is reachable from the views switcher", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/views");
  await expect(page.getByRole("link", { name: "Scrum" })).toBeVisible();
});
