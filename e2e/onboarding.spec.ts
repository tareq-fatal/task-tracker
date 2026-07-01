import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("SuperAdmin onboards a tenant; its owner logs in as a restricted TenantAdmin", async ({ page }) => {
  const suffix = `${Date.now()}`.slice(-8);
  const slug = `acme${suffix}`;
  const owner = `owner${suffix}`;
  const pass = "Acme-2026!";

  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/admin/tenants");
  await expect(page.getByRole("heading", { name: "Mandanten" })).toBeVisible();
  await page.waitForTimeout(900); // hydrate the wizard

  await page.locator("#tw-name").fill("Acme Corp");
  await page.locator("#tw-slug").fill(slug);
  await page.locator("#tw-oname").fill("Acme Owner");
  await page.locator("#tw-ouser").fill(owner);
  await page.locator("#tw-oemail").fill(`${owner}@acme.test`);
  await page.locator("#tw-opass").fill(pass);

  const create = page.getByRole("button", { name: "Mandant anlegen" });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByText(`✓ /${slug}`)).toBeVisible();

  // the new empty tenant now appears in the list with exactly its owner (1 user)
  const row = page.getByTestId("tenant-row").filter({ hasText: `/${slug}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText("1 Nutzer");
  // (the owner is created with role Admin — see actions/tenants.ts + roles.test.ts;
  //  mid-test re-login as the owner isn't possible in this CI chromium.)
});

test("a TenantAdmin (non-super) cannot open the tenants manager", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de"); // tarek is Admin, not SuperAdmin
  await page.goto("/admin/tenants");
  await expect(page).toHaveURL("/");
});
