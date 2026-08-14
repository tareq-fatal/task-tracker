#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Nachpflege für Aufgaben, die die MCP (noch) nicht kann.
//
// Läuft INNERHALB des Produktions-Containers, wie infra/mcp-setup.mjs — nur dort
// liegen der generierte Prisma-Client und die Datenbank-Verbindung.
//
// Drei Dinge, für die POST /api/mcp keinen Weg anbietet:
//   • --assign      Aufgaben einem Benutzer zuweisen (update_task kennt kein
//                   Zuweisungsfeld, nur create_task)
//   • --review      Aufgaben in den Prüf-Status heben (scrumColumn="to-verify";
//                   der Basisstatus wird dabei auf InProgress gesetzt, damit die
//                   Aufgabe NICHT als erledigt zählt — siehe src/lib/scrum.ts)
//   • --link        Aufgaben verknüpfen (TaskLink: DependsOn/Blocks/RelatedTo/
//                   SubtaskOf)
//
// Alles idempotent: bereits zugewiesene, bereits geprüfte oder bereits
// verknüpfte Aufgaben werden gemeldet und übersprungen.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LINK_TYPES = ["DependsOn", "Blocks", "RelatedTo", "SubtaskOf"];
const REVIEW_COLUMN = "to-verify";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (n) => process.argv.includes(`--${n}`);
const die = (m) => {
  console.error(`\n  ✖ ${m}\n`);
  process.exit(1);
};

/** Aufgaben eines Mandanten, indiziert über ihr Schlüssel-Präfix im Titel. */
async function loadTasks(tenantSlug, prefix) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) die(`kein Mandant mit dem Kürzel '${tenantSlug}'`);
  const rows = await prisma.task.findMany({
    where: { tenantId: tenant.id, title: { startsWith: prefix } },
    select: {
      id: true, title: true, status: true, scrumColumn: true,
      assignedToUserId: true, completedAt: true, progress: true,
    },
  });
  const byKey = new Map();
  for (const t of rows) byKey.set(t.title.split(" ")[0], t);
  return { tenant, rows, byKey };
}

async function main() {
  const tenantSlug = arg("tenant", "tarek-claude");
  const prefix = arg("prefix", "TOF-");
  const { tenant, rows, byKey } = await loadTasks(tenantSlug, prefix);
  console.log(`\n  Mandant '${tenant.slug}': ${rows.length} Aufgaben mit '${prefix}'\n`);

  // ── Zuweisen ───────────────────────────────────────────────────────────────
  if (flag("assign")) {
    const username = arg("assign-to") ?? die("--assign braucht --assign-to <benutzername>");
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) die(`kein Benutzer '${username}'`);
    if (user.tenantId !== tenant.id) die(`'${username}' gehört nicht zu '${tenant.slug}'`);

    // Zwei Betriebsarten:
    //   ohne --assign-keys  → nur Aufgaben OHNE Zuständigen. Eine bestehende
    //                         Zuweisung wird nie überschrieben, sonst nimmt ein
    //                         Massenlauf jemandem seine Aufgabe weg.
    //   mit  --assign-keys  → genau diese Aufgaben, auch wenn sie schon jemandem
    //                         gehören. Umhängen ist hier die Absicht.
    const keys = (arg("assign-keys") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    let ziel;
    if (keys.length > 0) {
      ziel = [];
      for (const k of keys) {
        const t = byKey.get(k);
        if (!t) { console.log(`  ?           ${k} nicht gefunden`); continue; }
        if (t.assignedToUserId === user.id) { console.log(`  bereits     ${k} gehört schon ${user.username}`); continue; }
        ziel.push(t);
      }
    } else {
      ziel = rows.filter((t) => !t.assignedToUserId);
    }

    for (const t of ziel) {
      const schritte = [
        prisma.task.update({ where: { id: t.id }, data: { assignedToUserId: user.id } }),
        // Der Hauptzuständige wird zusätzlich in TaskAssignee gespiegelt — so
        // macht es create_task auch, sonst fehlt die Aufgabe in Personen-Filtern.
        prisma.taskAssignee.upsert({
          where: { taskId_userId: { taskId: t.id, userId: user.id } },
          create: { taskId: t.id, userId: user.id },
          update: {},
        }),
      ];
      // Beim Umhängen den alten Hauptzuständigen aus der Spiegelung nehmen,
      // sonst steht die Aufgabe weiter in seiner Personen-Liste.
      if (t.assignedToUserId && t.assignedToUserId !== user.id) {
        schritte.push(
          prisma.taskAssignee.deleteMany({
            where: { taskId: t.id, userId: t.assignedToUserId },
          })
        );
      }
      await prisma.$transaction(schritte);
      if (keys.length > 0) console.log(`  umgehängt   ${t.title.split(" ")[0]} -> ${user.username}`);
    }

    if (keys.length > 0) {
      console.log(`\n  ${ziel.length} Aufgaben auf ${user.name} (${user.username}) umgehängt\n`);
    } else {
      console.log(`  zugewiesen  ${ziel.length} Aufgaben an ${user.name} (${user.username})`);
      console.log(`  unberührt   ${rows.length - ziel.length} (hatten schon eine Zuständigkeit)\n`);
    }
  }

  // ── Prüf-Status ────────────────────────────────────────────────────────────
  if (flag("review")) {
    const keys = (arg("keys") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) die('--review braucht --keys "TOF-0119,TOF-0120"');

    for (const key of keys) {
      const t = byKey.get(key);
      if (!t) { console.log(`  ?           ${key} nicht gefunden`); continue; }
      if (t.scrumColumn === REVIEW_COLUMN) { console.log(`  bereits     ${key} steht schon zur Prüfung`); continue; }
      await prisma.task.update({
        where: { id: t.id },
        data: {
          scrumColumn: REVIEW_COLUMN,
          // statusForColumn("to-verify") === "InProgress": die Aufgabe darf
          // nicht als erledigt zählen, solange Tarek sie nicht abgenommen hat.
          status: "InProgress",
          completedAt: null,
          progress: t.progress === 100 ? 90 : t.progress,
        },
      });
      console.log(`  zur Prüfung ${key} — ${t.title.slice(0, 56)}`);
    }
    console.log("");
  }

  // ── Verknüpfen ─────────────────────────────────────────────────────────────
  if (flag("link")) {
    // Format: "TOF-0013:DependsOn:TOF-0014,TOF-0011:SubtaskOf:TOF-0005"
    const specs = (arg("links") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (specs.length === 0) die('--link braucht --links "TOF-0013:DependsOn:TOF-0014,…"');

    let neu = 0, schon = 0;
    for (const spec of specs) {
      const [von, typ, nach] = spec.split(":");
      if (!LINK_TYPES.includes(typ)) die(`unbekannter Verknüpfungstyp '${typ}' — erlaubt: ${LINK_TYPES.join(", ")}`);
      const a = byKey.get(von), b = byKey.get(nach);
      if (!a || !b) { console.log(`  ?           ${spec} — ${!a ? von : nach} nicht gefunden`); continue; }
      if (a.id === b.id) { console.log(`  ?           ${spec} — Aufgabe kann nicht auf sich selbst zeigen`); continue; }

      const vorhanden = await prisma.taskLink.findUnique({
        where: { taskId_linkedTaskId_type: { taskId: a.id, linkedTaskId: b.id, type: typ } },
      });
      if (vorhanden) { schon += 1; continue; }
      await prisma.taskLink.create({ data: { taskId: a.id, linkedTaskId: b.id, type: typ } });
      console.log(`  verknüpft   ${von} ${typ} ${nach}`);
      neu += 1;
    }
    console.log(`\n  ${neu} neue Verknüpfungen, ${schon} bestanden bereits\n`);
  }

  // ── Wiederaufnahme-Prompt (TOF-0000) ───────────────────────────────────────
  // Der Prompt steht an zwei Stellen: docs/WIEDERAUFNAHME-PROMPT.md und als
  // Aufgabe TOF-0000. Damit sie nicht auseinanderlaufen, ist die Datei die
  // Quelle und dieser Schalter schreibt sie in die Aufgabe.
  if (flag("resume-prompt")) {
    const datei = arg("file") ?? "/app/.wiederaufnahme.md";
    const { readFile } = await import("node:fs/promises");
    let md;
    try {
      md = await readFile(datei, "utf8");
    } catch {
      die(`Datei nicht lesbar: ${datei}`);
    }
    // Alles nach der ersten Trennlinie ist der kopierfertige Block; davor steht
    // nur die Erklärung für Leser des Repos.
    const teile = md.split(/\r?\n---\r?\n/);
    if (teile.length < 2) die("in der Datei fehlt die Trennlinie '---' vor dem Prompt");
    const prompt = teile[1].trim();
    if (!prompt) die("der Block nach der Trennlinie ist leer");

    const t = byKey.get("TOF-0000");
    if (!t) {
      die(
        "TOF-0000 existiert noch nicht — einmalig über die MCP anlegen " +
          "(create_task, Projekt Task-Tracker, Priorität Critical), danach pflegt dieser Schalter sie."
      );
    }
    const neu = "Diesen Text kopieren und in eine neue, leere Unterhaltung einfügen:\n\n" + prompt;
    const aktuell = await prisma.task.findUnique({
      where: { id: t.id },
      select: { description: true },
    });
    if (aktuell.description === neu) {
      console.log("  unverändert TOF-0000 ist schon auf dem Stand der Datei\n");
    } else {
      await prisma.task.update({ where: { id: t.id }, data: { description: neu } });
      console.log(`  erneuert    TOF-0000 aus ${datei} (${neu.length} Zeichen)\n`);
    }
  }

  if (!flag("assign") && !flag("review") && !flag("link") && !flag("resume-prompt")) {
    die("nichts zu tun — erwartet mindestens eines von --assign, --review, --link, --resume-prompt");
  }
}

main()
  .catch((e) => { console.error(`\n  ✖ ${e?.message ?? e}\n`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
