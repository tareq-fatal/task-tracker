import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// TOF-0839 Projekt-Wissen — UI-Smoke gegen die Seed-Daten (admin aus prisma/seed.ts).
// Seite anlegen → Markdown-Ansicht → bearbeiten (neue Version) → Verlauf/Diff → Geheimnis abgelehnt
// → Entscheidung → Suche → Export-ZIP. Alte /kontext-Adresse leitet weiter.

const SLUG = `e2e-${Date.now().toString(36)}`;

test("Projekt-Wissen: anlegen, versionieren, Geheimnis abweisen, suchen, exportieren", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/projects");
  const href = await page.locator('a[href^="/projects/c"]').first().getAttribute("href");
  const projectId = href!.split("/")[2];

  // alte Adresse → neue Ansicht
  await page.goto(`/projects/${projectId}/kontext`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/wissen$`));
  await expect(page.getByRole("heading", { name: "Projekt-Wissen" })).toBeVisible();

  // neue Seite
  const editor = page.getByTestId("wissen-editor");
  await editor.locator('input[name="titel"]').fill("E2E Deploy-Notiz");
  await editor.locator('input[name="slug"]').fill(SLUG);
  await editor.locator('textarea[name="inhalt"]').fill("## Ablauf\n\n- **Backup** zuerst\n- dann Rollout, siehe TOF-0839\n");
  await editor.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(new RegExp(`/wissen/${SLUG}$`));
  await expect(page.getByTestId("wissen-markdown").locator("strong")).toHaveText("Backup");

  // bearbeiten → zweite Version
  await page.goto(`/projects/${projectId}/wissen/${SLUG}?bearbeiten=1`);
  await page.locator('textarea[name="inhalt"]').fill("## Ablauf\n\n- **Backup** zuerst\n- dann Rollout\n- Smoke-Test\n");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert — neue Version.")).toBeVisible();

  // Geheimnis → klare Meldung mit Zeile
  await page.locator('textarea[name="inhalt"]').fill("## Zugang\n\npasswort: Sommer2026!\n");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Zeile 3 sieht nach einem Zugangsdatum aus");

  // Verlauf: zwei Versionen, ältere zeigt Diff
  await page.goto(`/projects/${projectId}/wissen/${SLUG}`);
  const versionen = page.getByTestId("wissen-versionen").locator("li");
  await expect(versionen).toHaveCount(2);
  await versionen.nth(1).locator("a").click();
  await expect(page.getByTestId("wissen-diff")).toContainText("Smoke-Test");
  await expect(page.getByRole("button", { name: "Wiederherstellen" })).toBeVisible();

  // Entscheidung + Suche
  await page.goto(`/projects/${projectId}/wissen`);
  const form = page.getByTestId("entscheidung-form");
  await form.locator('textarea[name="was"]').fill("E2E: Rollout nur nach Backup");
  await form.locator('textarea[name="warum"]').fill("Rückweg muss sicher sein");
  await form.getByRole("button", { name: "Entscheidung eintragen" }).click();
  await expect(page.getByTestId("wissen-entscheidungen")).toContainText("E2E: Rollout nur nach Backup");
  await page.goto(`/projects/${projectId}/wissen?q=Rollout`);
  await expect(page.getByTestId("wissen-treffer")).toContainText("E2E Deploy-Notiz");

  // Export
  const res = await page.request.get(`/api/wissen/export?projectId=${projectId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  const body = await res.body();
  expect(body.readUInt32LE(0)).toBe(0x04034b50);
  expect(body.includes(Buffer.from(`${SLUG}.md`))).toBe(true);
});

test("Projekt-Wissen ohne Anmeldung: Seite leitet zum Login, Export 401", async ({ page, request }) => {
  await page.goto("/wissen");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/api/wissen/export")).status()).toBe(401);
});
