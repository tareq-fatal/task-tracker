import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #31 — admin creates a user without email/password → gets a temp password to hand over.
test("admin creates a user without email or password (temp password shown)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/users");

  await page.getByRole("button", { name: "Neuer Benutzer" }).click();
  const uname = "nomail" + Date.now().toString().slice(-6);
  await page.getByLabel(/Name/).first().fill("Kein Email User");
  await page.getByLabel(/Benutzername/).first().fill(uname);
  // leave email + password blank on purpose

  await page.getByRole("button", { name: "Benutzer erstellen" }).click();

  // the generated temp password is surfaced for the admin
  await expect(page.getByText("temporärem Passwort")).toBeVisible();
  await expect(page.getByText(/Task-[0-9a-f]{8}/)).toBeVisible();
});
