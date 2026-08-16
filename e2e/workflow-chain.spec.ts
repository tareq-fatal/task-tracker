import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mintApiToken } from "../src/lib/api-token";
import { BASE } from "./helpers";

/**
 * Der vereinbarte Ablauf (Tarek, 16.08.2026):
 *
 *   1 umsetzen → 2 selbst testen → 3 Tarek nimmt ab → 4 ausliefern → schließen
 *
 * Geprüft wird das, was still brechen kann: dass die Zuständigkeit wirklich an
 * der Spalte hängt (und nicht am Gedächtnis der Beteiligten), dass Schritt 4
 * noch NICHT als erledigt zählt, und dass eine ausdrücklich mitgegebene
 * Zuweisung die Regel schlägt statt von ihr überschrieben zu werden.
 */

const prisma = new PrismaClient();
const CHAIN: [string, string][] = [
  ["in-progress", "bauer"],
  ["self-test", "bauer"],
  ["to-verify", "abnehmer"],
  ["release", "bauer"],
];

let token = "";
let tenantId = "";
let bauerId = "";
let abnehmerId = "";

test.beforeAll(async () => {
  const actor = await prisma.user.findFirstOrThrow({
    where: { username: "tarek" },
    select: { id: true, tenantId: true },
  });
  tenantId = actor.tenantId;

  const mk = async (username: string, name: string) =>
    (
      await prisma.user.upsert({
        where: { username },
        update: { tenantId, deactivatedAt: null },
        create: { name, username, passwordHash: "x", role: "Admin", tenantId },
        select: { id: true },
      })
    ).id;
  bauerId = await mk("bauer", "Bauer");
  abnehmerId = await mk("abnehmer", "Abnehmer");

  // Dieselben vier Regeln, die die Migration für Tareks Mandanten anlegt.
  await prisma.automationRule.deleteMany({ where: { tenantId, triggerType: "column_to" } });
  await prisma.automationRule.createMany({
    data: CHAIN.map(([col, owner]) => ({
      tenantId,
      name: `Ablauf — ${col}`,
      enabled: true,
      triggerType: "column_to",
      triggerValue: col,
      actionType: "assign_to",
      actionValue: owner,
    })),
  });

  const { raw, tokenHash, prefix } = mintApiToken();
  await prisma.apiToken.create({
    data: { name: "e2e workflow", tokenHash, prefix, userId: actor.id, tenantId, scopes: "read,write" },
  });
  token = raw;
});

test.afterAll(async () => {
  await prisma.automationRule.deleteMany({ where: { tenantId, triggerType: "column_to" } });
  await prisma.$disconnect();
});

async function mcp(op: string, params: unknown) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ op, params }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const row = (id: string) =>
  prisma.task.findUniqueOrThrow({
    where: { id },
    select: { scrumColumn: true, status: true, assignedToUserId: true, progress: true },
  });

test("the chain hands the task over by itself, step by step", async () => {
  const created = await mcp("create_task", { title: "e2e — Ablauf-Kette" });
  expect(created.status).toBe(200);
  const id = created.body.data.id;

  for (const [column, owner] of CHAIN) {
    const res = await mcp("update_task", { taskId: id, scrumColumn: column });
    expect(res.status, column).toBe(200);
    const t = await row(id);
    expect(t.scrumColumn, column).toBe(column);
    expect(t.assignedToUserId, `${column} muss bei ${owner} liegen`).toBe(
      owner === "bauer" ? bauerId : abnehmerId
    );
    // Der Kern der Regel: kein Schritt der Kette gilt als erledigt — auch
    // "release" nicht. Ausgeliefert ist noch nicht abgeschlossen.
    expect(t.status, column).toBe("InProgress");
  }
});

test("closing happens after step 3, and only deliberately", async () => {
  const id = (await mcp("create_task", { title: "e2e — Abschluss nach Abnahme" })).body.data.id;
  await mcp("update_task", { taskId: id, scrumColumn: "to-verify" });
  expect((await row(id)).status).toBe("InProgress"); // Abnahme läuft, nichts geschlossen

  await mcp("update_task", { taskId: id, scrumColumn: "release" });
  expect((await row(id)).status).toBe("InProgress"); // ausgeliefert, immer noch offen

  const done = await mcp("update_task", { taskId: id, status: "Done", progress: 100 });
  expect(done.status).toBe(200);
  const t = await row(id);
  expect(t.status).toBe("Done");
  expect(t.progress).toBe(100);
});

test("an explicit assignee beats the rule instead of being overwritten", async () => {
  const id = (await mcp("create_task", { title: "e2e — ausdrückliche Zuweisung" })).body.data.id;
  // Spalte 3 würde auf "abnehmer" zeigen — hier ist ausdrücklich jemand anderes gemeint.
  const res = await mcp("update_task", { taskId: id, scrumColumn: "to-verify", assignee: "bauer" });
  expect(res.status).toBe(200);
  expect((await row(id)).assignedToUserId).toBe(bauerId);
});

test("a status change does not shuffle the assignee", async () => {
  // "InProgress" liegt hinter drei Spalten. Ein Statuswechsel darf die
  // Zuständigkeit nicht umhängen, sonst rutscht eine Aufgabe in Schritt 3
  // beim nächsten Speichern zurück an den Bearbeiter.
  const id = (await mcp("create_task", { title: "e2e — Status ohne Spalte" })).body.data.id;
  await mcp("update_task", { taskId: id, scrumColumn: "to-verify" });
  expect((await row(id)).assignedToUserId).toBe(abnehmerId);

  await mcp("update_task", { taskId: id, priority: "High" });
  expect((await row(id)).assignedToUserId).toBe(abnehmerId);
});

test("dependencies are real links, not prose", async () => {
  const a = (await mcp("create_task", { title: "e2e — hängt ab" })).body.data.id;
  const b = (await mcp("create_task", { title: "e2e — Voraussetzung" })).body.data.id;

  const linked = await mcp("link_tasks", { taskId: a, linkedTaskId: b, type: "DependsOn" });
  expect(linked.status).toBe(200);
  expect(linked.body.data.alreadyExisted).toBe(false);

  const stored = await prisma.taskLink.findMany({ where: { taskId: a }, select: { linkedTaskId: true, type: true } });
  expect(stored).toEqual([{ linkedTaskId: b, type: "DependsOn" }]);

  // Zweimal dasselbe verknüpfen ist kein Fehler, erzeugt aber auch nichts Neues.
  const again = await mcp("link_tasks", { taskId: a, linkedTaskId: b, type: "DependsOn" });
  expect(again.body.data.alreadyExisted).toBe(true);
  expect(await prisma.taskLink.count({ where: { taskId: a } })).toBe(1);

  expect((await mcp("link_tasks", { taskId: a, linkedTaskId: a, type: "RelatedTo" })).status).toBe(400);
});

test("a link cannot reach into another mandant", async () => {
  const mine = (await mcp("create_task", { title: "e2e — eigene Aufgabe" })).body.data.id;
  const foreign = await prisma.task.findFirst({
    where: { tenantId: { not: tenantId } },
    select: { id: true },
  });
  test.skip(!foreign, "Seed hat keine Aufgabe in einem anderen Mandanten");

  const res = await mcp("link_tasks", { taskId: mine, linkedTaskId: foreign!.id, type: "RelatedTo" });
  expect(res.status).toBe(404);
  expect(await prisma.taskLink.count({ where: { taskId: mine } })).toBe(0);
});
