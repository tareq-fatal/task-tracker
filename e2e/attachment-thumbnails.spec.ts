import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * Anmelden und die Willkommens-Einführung wegklicken. Sie erscheint beim
 * ersten Login eines Benutzers und legt sich als Dialog über die Seite —
 * ohne das misst man hier den Tour-Dialog statt der Aufgabenansicht.
 */
async function loginClean(page: Page, user: string, pass: string) {
  await login(page, user, pass, "de");
  const skip = page.getByRole("button", { name: "Überspringen" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByText(/Willkommen,/)).toHaveCount(0);
}

/**
 * Bildanhänge (2026-08-14).
 *
 * Tarek: eine Liste mit 164 Titeln hilft nicht — man muss beim Scrollen SEHEN,
 * worum es geht. Diese Tests decken die zwei Dinge ab, die dabei schiefgehen
 * können: die Vorschau erscheint nicht, oder sie erscheint über die
 * Mandantengrenze hinweg.
 */

test("the preview route is tenant-locked, exactly like the full file", async ({ page }) => {
  await loginClean(page, "tarek", "Demo-2026!");

  // Ein Anhang aus einem fremden Mandanten (oder eine erfundene ID) darf weder
  // in voller Größe noch als Vorschau ausgeliefert werden. ?thumb=1 ist kein
  // zweiter, ungeprüfter Weg an die Datei.
  for (const suffix of ["", "?inline=1", "?thumb=1"]) {
    const res = await page.request.get(`/download/attachment/not-my-tenant-attachment${suffix}`);
    expect(res.status(), suffix).toBe(404);
  }
});

test("an uploaded image shows up as a picture, not just a file name", async ({ page }) => {
  await loginClean(page, "tarek", "Demo-2026!");
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
  await loginClean(page, "tarek", "Demo-2026!");
  await page.goto("/list");
  // Gruppierung ist der Standard: jede Gruppe bekommt eine eigene Kopfzeile
  // mit Projektnamen und Anzahl. (Wie viele Gruppen es sind, hängt am
  // Datenbestand — geprüft wird, DASS gruppiert wird.)
  const toggle = page.getByRole("button", { name: /Nach Projekt/i });
  await expect(toggle).toBeVisible();
  const groupHeaders = page.locator("table tbody tr td[colspan]");
  const grouped = await groupHeaders.count();
  expect(grouped).toBeGreaterThan(0);

  // Und der Schalter hebt die Gruppierung wieder auf.
  await toggle.click();
  await expect(groupHeaders).toHaveCount(0);
});

test("'Als Nächstes' never shows more than ten tasks", async ({ page }) => {
  await loginClean(page, "tarek", "Demo-2026!");
  await page.goto("/next");
  await expect(page.getByRole("heading", { name: "Als Nächstes" })).toBeVisible();
  const cards = page.locator("a[href^='/tasks/']");
  expect(await cards.count()).toBeLessThanOrEqual(10);
});
