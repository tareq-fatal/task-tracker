import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole, isStaffRole, PRIORITY_SHORT } from "@/lib/enums";
import { taskVisibilityClause } from "@/lib/task-access";
import { instanceUrl } from "@/lib/instance-url";
import { pruefeAufGeheimnisse } from "./geheimnis";
import {
  ART_TITEL,
  ENTSCHEIDUNG_MAX_ZEICHEN,
  KONTEXT_ZIEL_ZEICHEN,
  SLUG_RE,
  WISSEN_ARTEN,
  WISSEN_MAX_TITEL,
  WISSEN_MAX_ZEICHEN,
  abschnitt,
  entscheidungenAlsMarkdown,
  exportReadme,
  haengeAn,
  istWissenArt,
  kuerze,
  normalisiere,
  projektOrdner,
  seiteAlsMarkdown,
  seitenVerweise,
  tofVerweise,
  type ExportSeite,
  type WissenArt,
} from "./text";
import type { ZipDatei } from "./zip";

// ─────────────────────────────────────────────────────────────────────────────
// TOF-0839 Projekt-Wissen — die EINE Stelle mit den Regeln. UI (Server Actions), MCP-Ops
// und Export-Routen rufen nur diese Funktionen; keine baut eigene Abfragen.
//
// Mandant: kommt immer vom Aufrufer-Kontext (Sitzung oder Token), nie aus einem Parameter.
// Lesen:     Staff (Admin, BackendAdmin, SubAdmin) im eigenen Mandanten, sonst Projektmitglied
//            oder Projekt-Ersteller. Eine bloße Zuweisung an EINE Aufgabe reicht NICHT — das
//            Wissen enthält Regeln/Adressen des ganzen Projekts.
// Schreiben: Admins + Projektmitglieder/-Ersteller. SubAdmin liest nur (wie überall).
// Fremdes oder unsichtbares Projekt → „nicht gefunden“ (404), nie „verboten“: keine Existenz-Probe.
// ─────────────────────────────────────────────────────────────────────────────

export type WissenNutzer = { id: string; name: string; role: string };

export class WissenFehler extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WissenFehler";
    this.status = status;
  }
}

const NICHT_GEFUNDEN = "Projekt nicht gefunden.";

export type Rechte = { lesen: boolean; schreiben: boolean; projekt: { id: string; name: string } | null };

export async function wissenRechte(u: WissenNutzer, tenantId: string, projectId: string): Promise<Rechte> {
  const projekt = await prisma.project.findFirst({
    where: { id: projectId, tenantId, deletedAt: null },
    select: { id: true, name: true, createdByUserId: true },
  });
  if (!projekt) return { lesen: false, schreiben: false, projekt: null };
  const p = { id: projekt.id, name: projekt.name };
  if (isAdminRole(u.role)) return { lesen: true, schreiben: true, projekt: p };
  const mitglied =
    projekt.createdByUserId === u.id ||
    Boolean(
      await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: u.id } },
        select: { id: true },
      }),
    );
  if (mitglied) return { lesen: true, schreiben: true, projekt: p };
  if (isStaffRole(u.role)) return { lesen: true, schreiben: false, projekt: p };
  return { lesen: false, schreiben: false, projekt: null };
}

async function mussLesen(u: WissenNutzer, tenantId: string, projectId: string) {
  const r = await wissenRechte(u, tenantId, projectId);
  if (!r.lesen || !r.projekt) throw new WissenFehler(NICHT_GEFUNDEN, 404);
  return r.projekt;
}

async function mussSchreiben(u: WissenNutzer, tenantId: string, projectId: string) {
  const r = await wissenRechte(u, tenantId, projectId);
  if (!r.lesen || !r.projekt) throw new WissenFehler(NICHT_GEFUNDEN, 404);
  if (!r.schreiben) throw new WissenFehler("Nur Admins und Projektmitglieder dürfen das Wissen ändern.", 403);
  return r.projekt;
}

/** Projekte, deren Wissen der Nutzer lesen darf. null = alle des Mandanten (Staff). */
export async function wissenProjektIds(u: WissenNutzer, tenantId: string): Promise<string[] | null> {
  if (isStaffRole(u.role)) return null;
  const [mitglied, eigene] = await Promise.all([
    prisma.projectMember.findMany({ where: { userId: u.id, project: { tenantId } }, select: { projectId: true } }),
    prisma.project.findMany({ where: { tenantId, createdByUserId: u.id }, select: { id: true } }),
  ]);
  return [...new Set([...mitglied.map((m) => m.projectId), ...eigene.map((p) => p.id)])];
}

/** Sichtbare Projekte (id, name) — für Übersicht/Export über den ganzen Mandanten. */
export async function wissenProjekte(u: WissenNutzer, tenantId: string) {
  const ids = await wissenProjektIds(u, tenantId);
  return prisma.project.findMany({
    where: { tenantId, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
}

/* ------------------------------------------------------------------ */
/* Seiten                                                              */
/* ------------------------------------------------------------------ */

const ART_REIHENFOLGE: Record<string, number> = Object.fromEntries(WISSEN_ARTEN.map((a, i) => [a, i]));

const seitenAuswahl = {
  id: true,
  slug: true,
  titel: true,
  art: true,
  angepinnt: true,
  aktualisiertAm: true,
  aktualisiertVon: { select: { name: true } },
} as const;

export async function seitenListe(u: WissenNutzer, tenantId: string, projectId: string) {
  await mussLesen(u, tenantId, projectId);
  const seiten = await prisma.wissenSeite.findMany({
    where: { tenantId, projectId, deletedAt: null },
    select: { ...seitenAuswahl, inhalt: true },
  });
  return seiten
    .map(({ inhalt, aktualisiertVon, ...s }) => ({ ...s, von: aktualisiertVon?.name ?? null, zeichen: inhalt.length }))
    .sort((a, b) => (ART_REIHENFOLGE[a.art] ?? 9) - (ART_REIHENFOLGE[b.art] ?? 9) || Number(b.angepinnt) - Number(a.angepinnt) || a.titel.localeCompare(b.titel, "de"));
}

export async function seiteLesen(
  u: WissenNutzer,
  tenantId: string,
  projectId: string,
  slug: string,
  opt: { versionen?: number } = {},
) {
  const projekt = await mussLesen(u, tenantId, projectId);
  const s = await prisma.wissenSeite.findFirst({
    where: { tenantId, projectId, slug, deletedAt: null },
    select: { ...seitenAuswahl, inhalt: true, createdAt: true },
  });
  if (!s) return null;
  const versionen = opt.versionen
    ? await prisma.wissenVersion.findMany({
        where: { seiteId: s.id },
        orderBy: { createdAt: "desc" },
        take: opt.versionen,
        select: { id: true, titel: true, createdAt: true, vonName: true },
      })
    : undefined;
  const { aktualisiertVon, ...rest } = s;
  return { projekt, ...rest, von: aktualisiertVon?.name ?? null, ...(versionen ? { versionen } : {}) };
}

export async function versionLesen(u: WissenNutzer, tenantId: string, projectId: string, slug: string, versionId: string) {
  await mussLesen(u, tenantId, projectId);
  return prisma.wissenVersion.findFirst({
    where: { id: versionId, seite: { tenantId, projectId, slug } },
    select: { id: true, titel: true, art: true, inhalt: true, createdAt: true, vonName: true },
  });
}

export type SchreibEingabe = {
  projectId: string;
  slug: string;
  titel?: string;
  art?: WissenArt;
  angepinnt?: boolean;
  inhalt?: string;
  anhang?: string;
};

export type SchreibErgebnis = {
  unveraendert: boolean;
  neu: boolean;
  seite: { id: string; slug: string; titel: string; art: string; angepinnt: boolean; aktualisiertAm: Date; zeichen: number };
  versionId: string | null;
};

/** Seite anlegen oder neue Version. Unverändert → keine neue Version. */
export async function seiteSchreiben(u: WissenNutzer, tenantId: string, e: SchreibEingabe): Promise<SchreibErgebnis> {
  const slug = (e.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw new WissenFehler("Ungültige Kennung (slug): nur a–z, 0–9 und Bindestrich, höchstens 60 Zeichen.");
  if (e.inhalt !== undefined && e.anhang !== undefined) throw new WissenFehler("Entweder „inhalt“ (ganze Seite) oder „anhang“ (Abschnitt anfügen) — nicht beides.");
  if (e.art !== undefined && !istWissenArt(e.art)) throw new WissenFehler(`Unbekannte Art. Erlaubt: ${WISSEN_ARTEN.join(", ")}.`);
  await mussSchreiben(u, tenantId, e.projectId);

  const alt = await prisma.wissenSeite.findUnique({
    where: { projectId_slug: { projectId: e.projectId, slug } },
    select: { id: true, tenantId: true, titel: true, art: true, inhalt: true, angepinnt: true, deletedAt: true },
  });
  // Unique ist (projectId, slug); projectId ist schon mandantengeprüft — trotzdem doppelt halten.
  if (alt && alt.tenantId !== tenantId) throw new WissenFehler(NICHT_GEFUNDEN, 404);
  const lebt = alt && !alt.deletedAt ? alt : null;

  const standardArt: WissenArt = istWissenArt(slug) ? slug : "seite";
  const titel = (e.titel ?? lebt?.titel ?? (standardArt !== "seite" ? ART_TITEL[standardArt] : slug)).trim();
  if (!titel || titel.length > WISSEN_MAX_TITEL) throw new WissenFehler(`Titel fehlt oder ist länger als ${WISSEN_MAX_TITEL} Zeichen.`);
  const art = e.art ?? (lebt?.art as WissenArt | undefined) ?? standardArt;
  const angepinnt = e.angepinnt ?? lebt?.angepinnt ?? (art === "stand" || art === "regeln" || art === "adressen");

  let inhalt: string;
  let zuPruefen: string;
  if (e.anhang !== undefined) {
    zuPruefen = normalisiere(e.anhang);
    inhalt = haengeAn(lebt?.inhalt ?? "", e.anhang);
  } else if (e.inhalt !== undefined) {
    inhalt = normalisiere(e.inhalt);
    zuPruefen = inhalt;
  } else {
    if (!lebt) throw new WissenFehler("Neue Seite braucht „inhalt“ oder „anhang“.");
    inhalt = lebt.inhalt;
    zuPruefen = "";
  }
  if (inhalt.length > WISSEN_MAX_ZEICHEN) throw new WissenFehler(`Höchstens ${WISSEN_MAX_ZEICHEN} Zeichen je Seite (jetzt ${inhalt.length}).`);
  const geheim = pruefeAufGeheimnisse({ Titel: titel, Inhalt: zuPruefen });
  if (geheim) throw new WissenFehler(geheim, 422);

  if (lebt && lebt.titel === titel && lebt.art === art && lebt.inhalt === inhalt && lebt.angepinnt === angepinnt) {
    const s = await prisma.wissenSeite.findUniqueOrThrow({ where: { id: lebt.id }, select: { id: true, slug: true, titel: true, art: true, angepinnt: true, aktualisiertAm: true } });
    return { unveraendert: true, neu: false, seite: { ...s, zeichen: inhalt.length }, versionId: null };
  }

  const jetzt = new Date();
  const ergebnis = await prisma.$transaction(async (tx) => {
    const seite = alt
      ? await tx.wissenSeite.update({
          where: { id: alt.id },
          data: { titel, art, inhalt, angepinnt, aktualisiertAm: jetzt, aktualisiertVonId: u.id, deletedAt: null, deletedBy: null },
          select: { id: true, slug: true, titel: true, art: true, angepinnt: true, aktualisiertAm: true },
        })
      : await tx.wissenSeite.create({
          data: { tenantId, projectId: e.projectId, slug, titel, art, inhalt, angepinnt, aktualisiertAm: jetzt, aktualisiertVonId: u.id },
          select: { id: true, slug: true, titel: true, art: true, angepinnt: true, aktualisiertAm: true },
        });
    const version = await tx.wissenVersion.create({
      data: { seiteId: seite.id, titel, art, inhalt, userId: u.id, vonName: u.name },
      select: { id: true },
    });
    await tx.wissenLink.deleteMany({ where: { seiteId: seite.id } });
    const links = [
      ...tofVerweise(inhalt).map((ziel) => ({ tenantId, seiteId: seite.id, typ: "aufgabe", ziel })),
      ...seitenVerweise(inhalt).filter((z) => z !== slug).map((ziel) => ({ tenantId, seiteId: seite.id, typ: "seite", ziel })),
    ];
    if (links.length) await tx.wissenLink.createMany({ data: links, skipDuplicates: true });
    return { seite, versionId: version.id };
  });
  return { unveraendert: false, neu: !lebt, seite: { ...ergebnis.seite, zeichen: inhalt.length }, versionId: ergebnis.versionId };
}

/** Wiederherstellen = neue Version mit altem Inhalt. Nichts wird überschrieben oder gelöscht. */
export async function seiteWiederherstellen(u: WissenNutzer, tenantId: string, projectId: string, slug: string, versionId: string) {
  await mussSchreiben(u, tenantId, projectId);
  const v = await prisma.wissenVersion.findFirst({
    where: { id: versionId, seite: { tenantId, projectId, slug } },
    select: { titel: true, art: true, inhalt: true },
  });
  if (!v) throw new WissenFehler("Version nicht gefunden.", 404);
  return seiteSchreiben(u, tenantId, { projectId, slug, titel: v.titel, art: istWissenArt(v.art) ? v.art : "seite", inhalt: v.inhalt });
}

/** Weich löschen (Versionen bleiben; erneutes Schreiben desselben slug holt die Seite zurück). */
export async function seiteLoeschen(u: WissenNutzer, tenantId: string, projectId: string, slug: string) {
  await mussSchreiben(u, tenantId, projectId);
  const r = await prisma.wissenSeite.updateMany({
    where: { tenantId, projectId, slug, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: u.id },
  });
  return { geloescht: r.count > 0 };
}

/* ------------------------------------------------------------------ */
/* Entscheidungen (nur anhängen)                                       */
/* ------------------------------------------------------------------ */

export type EntscheidungEingabe = {
  projectId: string;
  was: string;
  warum: string;
  wer?: string;
  datum?: Date;
  aufgaben?: string[];
  korrigiertId?: string;
};

export async function entscheidungHinzufuegen(u: WissenNutzer, tenantId: string, e: EntscheidungEingabe) {
  await mussSchreiben(u, tenantId, e.projectId);
  const was = normalisiere(e.was ?? "").trim();
  const warum = normalisiere(e.warum ?? "").trim();
  const wer = (e.wer ?? u.name).trim().slice(0, 120) || u.name;
  if (!was) throw new WissenFehler("„was“ fehlt.");
  if (!warum) throw new WissenFehler("„warum“ fehlt — eine Entscheidung ohne Begründung hilft späteren Sitzungen nicht.");
  if (was.length + warum.length > ENTSCHEIDUNG_MAX_ZEICHEN) throw new WissenFehler(`Höchstens ${ENTSCHEIDUNG_MAX_ZEICHEN} Zeichen für „was“ + „warum“.`);
  const geheim = pruefeAufGeheimnisse({ Was: was, Warum: warum, Wer: wer });
  if (geheim) throw new WissenFehler(geheim, 422);
  const aufgaben = [...new Set([...(e.aufgaben ?? []).flatMap((a) => tofVerweise(a.toUpperCase())), ...tofVerweise(`${was}\n${warum}`)])].sort();
  if (e.korrigiertId) {
    const alt = await prisma.entscheidung.findFirst({ where: { id: e.korrigiertId, tenantId, projectId: e.projectId }, select: { id: true } });
    if (!alt) throw new WissenFehler("Die korrigierte Entscheidung gibt es in diesem Projekt nicht.", 404);
  }
  return prisma.entscheidung.create({
    data: {
      tenantId,
      projectId: e.projectId,
      datum: e.datum ?? new Date(),
      wer,
      was,
      warum,
      aufgaben,
      korrigiertId: e.korrigiertId ?? null,
      createdById: u.id,
    },
    select: { id: true, datum: true, wer: true, was: true, warum: true, aufgaben: true, korrigiertId: true, createdAt: true },
  });
}

export async function entscheidungenListe(u: WissenNutzer, tenantId: string, projectId: string, limit = 100) {
  await mussLesen(u, tenantId, projectId);
  return prisma.entscheidung.findMany({
    where: { tenantId, projectId },
    orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { id: true, datum: true, wer: true, was: true, warum: true, aufgaben: true, korrigiertId: true, createdAt: true },
  });
}

/* ------------------------------------------------------------------ */
/* Verweise auf Aufgaben                                               */
/* ------------------------------------------------------------------ */

/** Aufgaben zu TOF-Nummern — nur die, die der Nutzer ohnehin sehen darf. */
export async function aufgabenZuTof(u: WissenNutzer, tenantId: string, tofs: string[]) {
  if (tofs.length === 0) return [];
  const tasks = await prisma.task.findMany({
    where: { AND: [taskVisibilityClause(u, tenantId), { OR: tofs.map((t) => ({ title: { startsWith: t } })) }] },
    select: { id: true, title: true, status: true, priority: true, assignedTo: { select: { name: true } } },
    take: 200,
  });
  return tasks.map((t) => ({ id: t.id, tof: /^(TOF-\d{4})/.exec(t.title)?.[1] ?? null, title: t.title, status: t.status, priority: t.priority, wer: t.assignedTo?.name ?? null }));
}

/** „Erwähnt im Wissen“ für die Aufgaben-Detailseite: Seiten + Entscheidungen, die diese TOF-Nummer nennen. */
export async function wissenErwaehnungen(u: WissenNutzer, tenantId: string, taskTitle: string) {
  const tof = /^(TOF-\d{4})\b/.exec(taskTitle)?.[1];
  if (!tof) return { seiten: [], entscheidungen: [] };
  const ids = await wissenProjektIds(u, tenantId);
  const projektFilter = ids ? { projectId: { in: ids } } : {};
  const [links, entscheidungen] = await Promise.all([
    prisma.wissenLink.findMany({
      where: { tenantId, typ: "aufgabe", ziel: tof, seite: { tenantId, deletedAt: null, ...projektFilter } },
      select: { seite: { select: { slug: true, titel: true, projectId: true } } },
      take: 20,
    }),
    prisma.entscheidung.findMany({
      where: { tenantId, aufgaben: { has: tof }, ...projektFilter },
      select: { id: true, was: true, datum: true, projectId: true },
      orderBy: { datum: "desc" },
      take: 10,
    }),
  ]);
  return { seiten: links.map((l) => l.seite), entscheidungen };
}

/* ------------------------------------------------------------------ */
/* Suche (Postgres-Volltext, 'german')                                  */
/* ------------------------------------------------------------------ */

export type Treffer = {
  typ: "seite" | "entscheidung";
  projectId: string;
  projekt: string;
  slug: string | null;
  id: string;
  titel: string;
  ausschnitt: string;
  rang: number;
};

export async function wissenSuchen(u: WissenNutzer, tenantId: string, query: string, opt: { projectId?: string; limit?: number } = {}): Promise<Treffer[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(opt.limit ?? 20, 1), 50);
  let ids: string[] | null;
  if (opt.projectId) {
    const r = await wissenRechte(u, tenantId, opt.projectId);
    if (!r.lesen) return [];
    ids = [opt.projectId];
  } else {
    ids = await wissenProjektIds(u, tenantId);
  }
  if (ids && ids.length === 0) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const projektSql = ids ? Prisma.sql`AND x."projectId" IN (${Prisma.join(ids)})` : Prisma.empty;

  // tenantId steht in BEIDEN Teilabfragen — auch wenn ids schon gefiltert sind.
  const zeilen = await prisma.$queryRaw<
    { typ: "seite" | "entscheidung"; id: string; projectId: string; projekt: string; slug: string | null; titel: string; ausschnitt: string; rang: number }[]
  >(Prisma.sql`
    -- t = alle Wörter (UND), o = irgendein Wort (ODER): gefunden wird mit o, t gibt Vorrang.
    WITH q0 AS (SELECT websearch_to_tsquery('german', ${q}) AS t),
         q AS (SELECT t, CASE WHEN numnode(t) = 0 OR position('!' in t::text) > 0 THEN t ELSE replace(t::text, ' & ', ' | ')::tsquery END AS o FROM q0)
    SELECT * FROM (
      SELECT 'seite' AS typ, x.id, x."projectId", p.name AS projekt, x.slug, x.titel,
             ts_headline('german', x.inhalt, q.o, 'MaxWords=30, MinWords=10, StartSel=**, StopSel=**') AS ausschnitt,
             (ts_rank(x.suche, q.o) + CASE WHEN x.suche @@ q.t THEN 0.3 ELSE 0 END
                                     + CASE WHEN x.titel ILIKE ${like} THEN 0.5 ELSE 0 END
                                     + CASE WHEN x.inhalt ILIKE ${like} THEN 0.05 ELSE 0 END)::float8 AS rang
        FROM "WissenSeite" x JOIN "Project" p ON p.id = x."projectId", q
       WHERE x."tenantId" = ${tenantId} AND p."tenantId" = ${tenantId} AND x."deletedAt" IS NULL AND p."deletedAt" IS NULL
         ${projektSql}
         AND (x.suche @@ q.o OR x.titel ILIKE ${like} OR x.inhalt ILIKE ${like})
      UNION ALL
      SELECT 'entscheidung' AS typ, x.id, x."projectId", p.name AS projekt, NULL AS slug, x.was AS titel,
             ts_headline('german', x.was || ' — ' || x.warum, q.o, 'MaxWords=30, MinWords=10, StartSel=**, StopSel=**') AS ausschnitt,
             (ts_rank(x.suche, q.o) + CASE WHEN x.suche @@ q.t THEN 0.3 ELSE 0 END + CASE WHEN (x.was || ' ' || x.warum) ILIKE ${like} THEN 0.05 ELSE 0 END)::float8 AS rang
        FROM "Entscheidung" x JOIN "Project" p ON p.id = x."projectId", q
       WHERE x."tenantId" = ${tenantId} AND p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL
         ${projektSql}
         AND (x.suche @@ q.o OR (x.was || ' ' || x.warum || ' ' || array_to_string(x.aufgaben, ' ')) ILIKE ${like})
    ) r
    ORDER BY rang DESC, titel ASC
    LIMIT ${limit}
  `);
  return zeilen.map((z) => ({ ...z, rang: Math.round(Number(z.rang) * 1000) / 1000 }));
}

/* ------------------------------------------------------------------ */
/* Sitzungsstart: projekt_kontext                                      */
/* ------------------------------------------------------------------ */

const DATUM = (d: Date) => d.toISOString().slice(0, 10);

export async function projektKontext(u: WissenNutzer, tenantId: string, projectId: string): Promise<string> {
  const projekt = await mussLesen(u, tenantId, projectId);
  const basis = instanceUrl();
  const [seiten, entscheidungen, offen, wartet, alle] = await Promise.all([
    prisma.wissenSeite.findMany({
      where: { tenantId, projectId, deletedAt: null, angepinnt: true },
      select: { slug: true, titel: true, art: true, inhalt: true, aktualisiertAm: true },
    }),
    prisma.entscheidung.findMany({
      where: { tenantId, projectId },
      orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: { datum: true, wer: true, was: true, warum: true, aufgaben: true },
    }),
    prisma.task.findMany({
      where: { AND: [taskVisibilityClause(u, tenantId), { projectId, status: { in: ["Todo", "InProgress"] }, priority: { in: ["Critical", "High"] } }] },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      take: 15,
      select: { title: true, priority: true, status: true, assignedTo: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { AND: [taskVisibilityClause(u, tenantId), { projectId, status: { in: ["Todo", "InProgress"] }, tags: { has: "wartet-auf-tarek" } }] },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { title: true },
    }),
    prisma.wissenSeite.findMany({ where: { tenantId, projectId, deletedAt: null, angepinnt: false }, select: { slug: true, titel: true }, orderBy: { titel: "asc" }, take: 40 }),
  ]);
  seiten.sort((a, b) => (ART_REIHENFOLGE[a.art] ?? 9) - (ART_REIHENFOLGE[b.art] ?? 9) || a.titel.localeCompare(b.titel, "de"));

  // Feste Teile zuerst bauen; das Budget für die angepinnten Seiten ist der Rest.
  const kopf = `# Projekt-Kontext: ${projekt.name}\n\nStand ${DATUM(new Date())} · ${basis}/projects/${projekt.id}/wissen\n`;
  const prio = (p: string) => PRIORITY_SHORT[p as keyof typeof PRIORITY_SHORT] ?? p;
  const teil = (t: string, zeilen: string[]) => (zeilen.length ? `\n## ${t}\n\n${zeilen.join("\n")}\n` : "");
  const ent = teil(
    "Letzte Entscheidungen",
    entscheidungen.map((e) => `- ${DATUM(e.datum)} · ${e.wer}: ${kuerze(e.was, 160)} — ${kuerze(e.warum, 160)}${e.aufgaben.length ? ` (${e.aufgaben.join(", ")})` : ""}`),
  );
  const auf = teil(
    "Offene P1/P2-Aufgaben",
    offen.map((t) => `- [${prio(t.priority)}] ${kuerze(t.title, 110)}${t.assignedTo ? ` — ${t.assignedTo.name}` : ""}${t.status === "InProgress" ? " (in Arbeit)" : ""}`),
  );
  const wt = teil("Wartet auf Tarek", wartet.map((t) => `- ${kuerze(t.title, 110)}`));
  const weitere = weitereSeiten(alle);
  const fuss =
    "\n## Am Ende der Sitzung\n\n" +
    "- Neues Wissen: `wissen_schreiben(projectId, slug, anhang|inhalt)` (z. B. slug \"stand\").\n" +
    "- Entscheidungen: `entscheidung_hinzufuegen(projectId, was, warum, aufgaben)`.\n" +
    "- Keine Zugangsdaten ins Wissen — der Server lehnt sie ab.\n";

  const fest = kopf.length + ent.length + auf.length + wt.length + weitere.length + fuss.length;
  const budget = Math.max(KONTEXT_ZIEL_ZEICHEN - fest, 1200);
  let mitte = "";
  if (seiten.length === 0) {
    mitte = "\n_Noch keine angepinnten Seiten. Lege „stand“, „regeln“ und „adressen“ mit wissen_schreiben an._\n";
  } else {
    const jeSeite = Math.floor(budget / seiten.length);
    for (const s of seiten) {
      const text = normalisiere(s.inhalt).trim();
      // Bei „Stand“ zuerst Ziel/Stand-Abschnitte, wenn die Seite lang ist.
      const kern = text.length > jeSeite && s.art === "stand" ? [abschnitt(text, ["ziel"]), abschnitt(text, ["stand"])].filter(Boolean).join("\n\n") || text : text;
      const stueck = `\n## ${s.titel} (${s.slug}, ${DATUM(s.aktualisiertAm)})\n\n${kuerze(kern, Math.max(jeSeite - s.titel.length - 30, 200))}\n`;
      mitte += stueck;
    }
  }
  return kopf + mitte + ent + auf + wt + weitere + fuss;
}

function weitereSeiten(alle: { slug: string; titel: string }[]): string {
  if (alle.length === 0) return "";
  return `\n## Weitere Seiten (wissen_lesen mit slug)\n\n${alle.map((s) => `${s.slug} (${s.titel})`).join(" · ")}\n`;
}

/* ------------------------------------------------------------------ */
/* Export (ZIP mit Markdown-Ordner)                                     */
/* ------------------------------------------------------------------ */

async function projektDateien(tenantId: string, p: { id: string; name: string }, ordner: string, basis: string): Promise<ZipDatei[]> {
  const [seiten, entscheidungen] = await Promise.all([
    prisma.wissenSeite.findMany({
      where: { tenantId, projectId: p.id, deletedAt: null },
      select: { slug: true, titel: true, art: true, angepinnt: true, inhalt: true, aktualisiertAm: true, aktualisiertVon: { select: { name: true } } },
      orderBy: { slug: "asc" },
    }),
    prisma.entscheidung.findMany({
      where: { tenantId, projectId: p.id },
      orderBy: [{ datum: "asc" }, { createdAt: "asc" }],
      select: { id: true, datum: true, wer: true, was: true, warum: true, aufgaben: true, korrigiertId: true },
    }),
  ]);
  const es: ExportSeite[] = seiten.map((s) => ({ ...s, aktualisiertVon: s.aktualisiertVon?.name ?? null }));
  const pre = ordner ? `${ordner}/` : "";
  return [
    { pfad: `${pre}README.md`, inhalt: exportReadme(p, es, basis) },
    ...es.map((s) => ({ pfad: `${pre}${s.slug}.md`, inhalt: seiteAlsMarkdown(s) })),
    { pfad: `${pre}ENTSCHEIDUNGEN.md`, inhalt: entscheidungenAlsMarkdown(p.name, entscheidungen) },
  ];
}

/** Ein Projekt (projectId) oder alle sichtbaren Projekte des Mandanten. */
export async function exportDateien(u: WissenNutzer, tenantId: string, projectId?: string): Promise<{ name: string; dateien: ZipDatei[] }> {
  const basis = instanceUrl();
  if (projectId) {
    const p = await mussLesen(u, tenantId, projectId);
    return { name: `wissen-${projektOrdner(p)}`, dateien: await projektDateien(tenantId, p, "", basis) };
  }
  const projekte = await wissenProjekte(u, tenantId);
  const dateien: ZipDatei[] = [];
  const index: string[] = ["# Projekt-Wissen — alle Projekte", ""];
  for (const p of projekte) {
    const ordner = projektOrdner(p);
    dateien.push(...(await projektDateien(tenantId, p, ordner, basis)));
    index.push(`- [${p.name}](${ordner}/README.md)`);
  }
  dateien.unshift({ pfad: "README.md", inhalt: index.join("\n") + "\n" });
  return { name: "wissen-alle-projekte", dateien };
}
