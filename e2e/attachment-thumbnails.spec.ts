import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Bildanhänge (2026-08-14).
 *
 * Tarek: eine Liste mit 164 Titeln hilft nicht — man muss beim Scrollen SEHEN,
 * worum es geht. Diese Tests decken die zwei Dinge ab, die dabei schiefgehen
 * können: die Vorschau erscheint nicht, oder sie erscheint über die
 * Mandantengrenze hinweg.
 */

test("the preview route is tenant-locked, exactly like the full file", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");

  // Ein Anhang aus einem fremden Mandanten (oder eine erfundene ID) darf weder
  // in voller Größe noch als Vorschau ausgeliefert werden. ?thumb=1 ist kein
  // zweiter, ungeprüfter Weg an die Datei.
  for (const suffix of ["", "?inline=1", "?thumb=1"]) {
    const res = await page.request.get(`/download/attachment/not-my-tenant-attachment${suffix}`);
    expect(res.status(), suffix).toBe(404);
  }
});

test("an uploaded image shows up as a picture, not just a file name", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/list");

  // Erste Aufgabe öffnen und ein Bild anhängen.
  const firstTask = page.locator("[data-testid='list-row'] a").first();
  await firstTask.click();
  await page.waitForURL(/\/tasks\//);

  // 1×1 PNG — reicht, um den ganzen Weg (Upload → Thumbnail → Anzeige) zu gehen.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  await page.locator("input[type=file]").first().setInputFiles({
    name: "screenshot.png",
    mimeType: "image/png",
    buffer: png,
  });

  // Die Galerie zeigt das Bild in der Aufgabe an.
  const preview = page.locator("img[src*='/download/attachment/'][src*='thumb=1']").first();
  await expect(preview).toBeVisible({ timeout: 15_000 });

  // Und der Klick vergrößert es.
  await preview.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the list groups by project instead of one long strip", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/list");
  // Gruppierung ist der Standard — die Kopfzeilen tragen die Projektnamen.
  await expect(page.getByRole("button", { name: /Nach Projekt/i })).toBeVisible();
  await expect(page.locator("tbody")).not.toHaveCount(1);
});

test("'Als Nächstes' never shows more than ten tasks", async ({ page }) => {
  await login(page, "tarek", "Demo-2026!", "de");
  await page.goto("/next");
  await expect(page.getByRole("heading", { name: "Als Nächstes" })).toBeVisible();
  const cards = page.locator("a[href^='/tasks/']");
  expect(await cards.count()).toBeLessThanOrEqual(10);
});
