import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Kunden-Report 2026-08-02: arabische Dateinamen kamen als Mojibake an
// (busboy-Latin-1-Fehldekodierung in Next-Server-Actions). Regression:
// Upload mit arabischem Namen → Name bleibt arabisch, Meta-Zeile (wer · wann)
// erscheint.
const ARABIC_NAME = "تقرير-الصيانة.pdf";

test("arabic attachment filename survives upload and shows uploader meta", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/list");
  await page.locator('[data-testid="list-row"] a').first().click();
  await page.waitForURL(/\/tasks\//);
  await page.waitForTimeout(700);

  await page.locator('input[type="file"]').first().setInputFiles({
    name: ARABIC_NAME,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test"),
  });

  // Name must render EXACTLY, not "Ø§Ù..." mojibake
  await expect(page.getByText(ARABIC_NAME).first()).toBeVisible({ timeout: 15_000 });
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/Ø§Ù/);
  // Meta line: uploader name + relative time ("gerade eben"-Familie)
  await expect(page.getByText(/jetzt|Sekunde|Minute/).first()).toBeVisible();
});
