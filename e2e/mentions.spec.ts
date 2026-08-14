import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mintApiToken } from "../src/lib/api-token";
import { login, BASE } from "./helpers";

/**
 * @-Erwähnungen (TOF-0386).
 *
 * Zwei Zusagen werden hier geprüft, weil beide still brechen können:
 *
 *  1. Eine Erwähnung erreicht nur Menschen im eigenen Mandanten. Bricht das,
 *     merkt es niemand — es wird nur jemand benachrichtigt, der die Aufgabe
 *     nie hätte sehen dürfen.
 *  2. Ein `@name` aus einer Sitzung (über POST /api/mcp) benachrichtigt
 *     dieselbe Person wie ein `@name` aus dem Browser, auch wenn die Aufgabe
 *     gar nicht ihr gehört. Genau darauf beruht die Arbeitsregel
 *     „fertig → Kommentar an @tarekfatal → Zur Prüfung".
 */

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function loginClean(page: Page, user: string, pass: string) {
  await login(page, user, pass, "de");
  const skip = page.getByRole("button", { name: "Überspringen" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** Ein Bearer-Token für einen Seed-Benutzer, direkt in der Datenbank. */
async function mintTokenFor(username: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { username },
    select: { id: true, tenantId: true },
  });
  const { raw, tokenHash, prefix } = mintApiToken();
  await prisma.apiToken.create({
    data: {
      name: `e2e ${username}`,
      tokenHash,
      prefix,
      userId: user.id,
      tenantId: user.tenantId,
      scopes: "read,write",
    },
  });
  return { raw, user };
}

async function mcp(raw: string, op: string, params: unknown) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({ op, params }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

test("a mention only resolves inside the own mandant", async ({ page }) => {
  // "tarek" lebt im Mandanten tarek, "alice" im Mandanten objektus.
  const foreign = await prisma.user.findFirst({
    where: { username: { in: ["alice", "bob", "charlie"] } },
    select: { username: true, tenantId: true },
  });
  const me = await prisma.user.findFirstOrThrow({
    where: { username: "tarek" },
    select: { username: true, tenantId: true },
  });
  expect(foreign, "Seed muss einen Benutzer in einem anderen Mandanten haben").toBeTruthy();
  expect(foreign!.tenantId).not.toBe(me.tenantId);

  await loginClean(page, "tarek", "Demo-2026!");
  await page.goto("/list");
  await page.locator("[data-testid='list-row'] a").first().click();
  await page.waitForURL(/\/tasks\//);

  const text = `Test @${me.username} und @${foreign!.username} und @gibtesnicht`;
  await page.locator("textarea").first().fill(text);
  await page.getByRole("button", { name: /Senden/i }).click();

  // Der eigene Name wird hervorgehoben, der fremde und der erfundene bleiben
  // gewöhnlicher Text — nicht stillschweigend geschluckt, aber eben auch
  // keine Erwähnung.
  const comment = page.locator("p", { hasText: "und @gibtesnicht" }).last();
  await expect(comment).toBeVisible({ timeout: 15_000 });
  await expect(comment.locator("span.bg-indigo-100", { hasText: `@${me.username}` })).toHaveCount(1);
  await expect(comment.locator("span.bg-indigo-100", { hasText: `@${foreign!.username}` })).toHaveCount(0);
  await expect(comment.locator("span.bg-indigo-100", { hasText: "@gibtesnicht" })).toHaveCount(0);

  // Und über die Grenze wurde nichts zugestellt.
  const leaked = await prisma.notification.count({
    where: { type: "mention", tenantId: foreign!.tenantId, createdAt: { gte: new Date(Date.now() - 120_000) } },
  });
  expect(leaked, "keine Erwähnung über die Mandantengrenze").toBe(0);
});

test("a mention from the API notifies, even on a task that is not the recipient's", async () => {
  const { raw, user: actor } = await mintTokenFor("tarek");

  // Empfänger: jemand anderes im selben Mandanten. Der Seed hat in diesem
  // Mandanten nur eine Person, also wird sie hier angelegt — als Admin, damit
  // sie die fremde Aufgabe auch sehen darf (genau Tareks Rolle).
  const recipient = await prisma.user.upsert({
    where: { username: "e2e-empfaenger" },
    update: { tenantId: actor.tenantId, deactivatedAt: null },
    create: {
      name: "E2E Empfänger",
      username: "e2e-empfaenger",
      passwordHash: "x", // wird nie zum Anmelden benutzt
      role: "Admin",
      tenantId: actor.tenantId,
    },
    select: { id: true, username: true, role: true },
  });

  // Aufgabe, die dem Empfänger NICHT gehört: erstellt und zugewiesen an den Akteur.
  const created = await mcp(raw, "create_task", {
    title: "e2e — Erwähnung über die Schnittstelle",
    assignedToUserId: actor.id,
  });
  expect(created.status).toBe(200);
  const taskId = created.body.data.id;

  const before = await prisma.notification.count({
    where: { userId: recipient.id, type: "mention" },
  });

  const commented = await mcp(raw, "add_comment", {
    taskId,
    content: `@${recipient.username} bitte prüfen — und @niemanddenesgibt`,
  });
  expect(commented.status).toBe(200);

  // Die Antwort sagt ehrlich, wen sie erreicht hat und wen nicht.
  expect(commented.body.data.mentions.notified).toContain(recipient.username);
  expect(commented.body.data.mentions.unknown).toContain("niemanddenesgibt");

  const after = await prisma.notification.count({
    where: { userId: recipient.id, type: "mention" },
  });
  expect(after, "die Erwähnung ist als Benachrichtigung angekommen").toBe(before + 1);
});

test("the API can hand a task over: assign by username and move it to Zur Prüfung", async () => {
  const { raw, user: actor } = await mintTokenFor("tarek");
  const created = await mcp(raw, "create_task", { title: "e2e — Übergabe zur Prüfung" });
  expect(created.status).toBe(200);
  const taskId = created.body.data.id;

  const moved = await mcp(raw, "update_task", {
    taskId,
    assignee: "tarek",
    scrumColumn: "to-verify",
  });
  expect(moved.status).toBe(200);

  const row = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { scrumColumn: true, status: true, assignedToUserId: true },
  });
  expect(row.scrumColumn).toBe("to-verify");
  // "Zur Prüfung" zählt NICHT als erledigt — genau darum geht es bei der Regel.
  expect(row.status).toBe("InProgress");
  expect(row.assignedToUserId).toBe(actor.id);
});

test("the API refuses to assign someone from another mandant", async () => {
  const { raw } = await mintTokenFor("tarek");
  const created = await mcp(raw, "create_task", { title: "e2e — fremde Zuweisung" });
  const taskId = created.body.data.id;

  const foreign = await prisma.user.findFirstOrThrow({
    where: { username: { in: ["alice", "bob", "charlie"] } },
    select: { username: true },
  });
  const res = await mcp(raw, "update_task", { taskId, assignee: foreign.username });
  expect(res.status).toBe(404); // "no such user in this mandant"
});
