import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

// TOF-0839 Projekt-Wissen gegen ein ECHTES Postgres (Volltext, generierte Spalten, Mandanten).
// Läuft nur mit WISSEN_TEST_DATABASE_URL (migrierte Wegwerf-DB, NIE Produktion), sonst übersprungen:
//   docker run -d --name wissen-pg -e POSTGRES_PASSWORD=… -p 55432:5432 postgres:16-alpine
//   DATABASE_URL=<url> npx prisma migrate deploy
//   WISSEN_TEST_DATABASE_URL=<url> npx vitest run src/lib/wissen/dienst.db.test.ts
// Alle Testdaten hängen an zwei frischen Mandanten und werden am Ende per Cascade entfernt.

const URL_ = process.env.WISSEN_TEST_DATABASE_URL;
vi.mock("server-only", () => ({}));

const run = URL_ ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const id = (s: string) => `${s}_${sfx}`;

// Zusammengesetzt, damit kein Scanner den Testwert für echt hält.
const FALSCHER_TOKEN = ["tt_", "mcp_", "0123456789abcdef0123"].join("");

type Mod = {
  prisma: typeof import("@/lib/prisma").prisma;
  d: typeof import("./dienst");
  ops: typeof import("@/lib/mcp/ops");
  token: typeof import("@/lib/api-token");
  zip: typeof import("./zip");
  kontext: typeof import("@/lib/kontext-laden");
};
let m: Mod;

const U = {
  adminA: { id: id("uAdminA"), name: "Admin A", role: "Admin" },
  memberA: { id: id("uMemberA"), name: "Mitglied A", role: "User" },
  outsiderA: { id: id("uOutA"), name: "Außen A", role: "User" },
  subA: { id: id("uSubA"), name: "Sub A", role: "SubAdmin" },
  adminB: { id: id("uAdminB"), name: "Admin B", role: "Admin" },
};
const T = { A: id("tA"), B: id("tB") };
const P = { a1: id("pA1"), a2: id("pA2"), b1: id("pB1") };

function ctx(u: (typeof U)[keyof typeof U], tenantId: string, scopes = "read,write") {
  return {
    user: { ...u, username: u.id, locale: "de" },
    tenant: { id: tenantId, slug: tenantId, name: tenantId },
    scopes: m.token.parseScopes(scopes),
    tokenId: "t",
  };
}

/** Wie die Route: Schema prüfen, dann laufen lassen. Fehler → { status, message }. */
async function op(name: string, c: ReturnType<typeof ctx>, params: unknown) {
  const o = m.ops.OPS[name];
  const parsed = o.schema.safeParse(params);
  if (!parsed.success) return { status: 400, message: parsed.error.issues[0]?.message ?? "invalid" };
  try {
    return { status: 200, data: (await o.run(c as never, parsed.data as never)) as Record<string, unknown> };
  } catch (e) {
    const err = e as { status?: number; message: string };
    return { status: err.status ?? 500, message: err.message };
  }
}

run("Projekt-Wissen (Postgres)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_;
    m = {
      prisma: (await import("@/lib/prisma")).prisma,
      d: await import("./dienst"),
      ops: await import("@/lib/mcp/ops"),
      token: await import("@/lib/api-token"),
      zip: await import("./zip"),
      kontext: await import("@/lib/kontext-laden"),
    };
    const { prisma } = m;
    await prisma.tenant.createMany({ data: [{ id: T.A, slug: T.A, name: "Mandant A" }, { id: T.B, slug: T.B, name: "Mandant B" }] });
    await prisma.user.createMany({
      data: [
        { ...U.adminA, username: U.adminA.id, passwordHash: "x", tenantId: T.A },
        { ...U.memberA, username: U.memberA.id, passwordHash: "x", tenantId: T.A },
        { ...U.outsiderA, username: U.outsiderA.id, passwordHash: "x", tenantId: T.A },
        { ...U.subA, username: U.subA.id, passwordHash: "x", tenantId: T.A },
        { ...U.adminB, username: U.adminB.id, passwordHash: "x", tenantId: T.B },
      ],
    });
    await prisma.project.createMany({
      data: [
        { id: P.a1, name: "Alpha", createdByUserId: U.adminA.id, tenantId: T.A },
        { id: P.a2, name: "Beta", createdByUserId: U.adminA.id, tenantId: T.A },
        { id: P.b1, name: "Fremd", createdByUserId: U.adminB.id, tenantId: T.B },
      ],
    });
    await prisma.projectMember.create({ data: { projectId: P.a1, userId: U.memberA.id } });
    // Außenstehender ist einer Aufgabe in Alpha zugewiesen — das reicht NICHT fürs Wissen.
    await prisma.task.create({
      data: {
        id: id("task1"),
        title: "TOF-0839 — Wissen bauen",
        priority: "Critical",
        tags: ["wartet-auf-tarek"],
        projectId: P.a1,
        tenantId: T.A,
        createdByUserId: U.adminA.id,
        assignedToUserId: U.outsiderA.id,
        assignees: { create: { userId: U.outsiderA.id } },
      },
    });
    await prisma.task.create({
      data: { id: id("taskB"), title: "TOF-0839 — fremder Mandant", projectId: P.b1, tenantId: T.B, createdByUserId: U.adminB.id },
    });
  }, 60_000);

  afterAll(async () => {
    if (!m) return;
    await m.prisma.tenant.deleteMany({ where: { id: { in: [T.A, T.B] } } });
    await m.prisma.$disconnect();
  });

  it("schreiben + lesen über die MCP-Ops, Mandant aus dem Token", async () => {
    const a = ctx(U.adminA, T.A);
    const w = await op("wissen_schreiben", a, {
      projectId: P.a1,
      slug: "stand",
      inhalt: "## Ziel\nOrtungsfunk Zebrafisch bauen.\n\n## Stand\nSiehe TOF-0839 und [[deploy]].",
    });
    expect(w.status).toBe(200);
    expect(w.data).toMatchObject({ unveraendert: false, neu: true, seite: { slug: "stand", art: "stand", angepinnt: true, titel: "Stand" } });

    const r = await op("wissen_lesen", a, { projectId: P.a1, slug: "stand", versionen: 5 });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ slug: "stand", von: "Admin A" });
    expect(String(r.data!.inhalt)).toContain("Zebrafisch");
    expect((r.data!.versionen as unknown[]).length).toBe(1);

    const row = await m.prisma.wissenSeite.findFirstOrThrow({ where: { projectId: P.a1, slug: "stand" } });
    expect(row.tenantId).toBe(T.A);
    const links = await m.prisma.wissenLink.findMany({ where: { seiteId: row.id }, orderBy: { typ: "asc" } });
    expect(links.map((l) => `${l.typ}:${l.ziel}`)).toEqual(["aufgabe:TOF-0839", "seite:deploy"]);

    const liste = await op("wissen_lesen", a, { projectId: P.a1 });
    expect((liste.data!.seiten as { slug: string }[]).map((s) => s.slug)).toEqual(["stand"]);
    const projekte = await op("wissen_lesen", a, {});
    expect((projekte.data!.projekte as { id: string }[]).map((p) => p.id).sort()).toEqual([P.a1, P.a2].sort());
  });

  it("unverändert → keine neue Version; anhang → neue Version unten angefügt", async () => {
    const a = ctx(U.adminA, T.A);
    const vorher = await m.prisma.wissenVersion.count({ where: { seite: { projectId: P.a1, slug: "stand" } } });
    const gleich = await op("wissen_schreiben", a, {
      projectId: P.a1,
      slug: "stand",
      inhalt: "## Ziel\r\nOrtungsfunk Zebrafisch bauen.\r\n\r\n## Stand\r\nSiehe TOF-0839 und [[deploy]].",
    });
    expect(gleich.data).toMatchObject({ unveraendert: true, versionId: null });
    expect(await m.prisma.wissenVersion.count({ where: { seite: { projectId: P.a1, slug: "stand" } } })).toBe(vorher);

    const an = await op("wissen_schreiben", a, { projectId: P.a1, slug: "stand", anhang: "Deploy am Abend erledigt." });
    expect(an.data).toMatchObject({ unveraendert: false, neu: false });
    const s = await m.d.seiteLesen(U.adminA, T.A, P.a1, "stand");
    expect(s!.inhalt).toMatch(/\[\[deploy\]\]\.\n\n### \d{4}-\d{2}-\d{2}\n\nDeploy am Abend erledigt\.\n$/);
    expect(await m.prisma.wissenVersion.count({ where: { seite: { projectId: P.a1, slug: "stand" } } })).toBe(vorher + 1);
  });

  it("Längengrenze und Parameter-Regeln", async () => {
    const a = ctx(U.adminA, T.A);
    expect((await op("wissen_schreiben", a, { projectId: P.a1, slug: "lang", inhalt: "x".repeat(50_001) })).status).toBe(400);
    await expect(m.d.seiteSchreiben(U.adminA, T.A, { projectId: P.a1, slug: "lang", inhalt: "x".repeat(50_001) })).rejects.toThrow(/Höchstens 50000/);
    // anhang darf die Grenze auch nicht über den Bestand hinaus sprengen
    await m.d.seiteSchreiben(U.adminA, T.A, { projectId: P.a1, slug: "lang", inhalt: "x".repeat(49_990) });
    await expect(m.d.seiteSchreiben(U.adminA, T.A, { projectId: P.a1, slug: "lang", anhang: "y".repeat(100) })).rejects.toThrow(/Höchstens/);
    expect((await op("wissen_schreiben", a, { projectId: P.a1, slug: "x", inhalt: "a", anhang: "b" })).status).toBe(400);
    expect((await op("wissen_schreiben", a, { projectId: P.a1, slug: "Böse Kennung", inhalt: "a" })).status).toBe(400);
    expect((await op("wissen_schreiben", a, { projectId: P.a1, slug: "x", inhalt: "a", tenantId: T.B })).status).toBe(400); // .strict()
    await m.d.seiteLoeschen(U.adminA, T.A, P.a1, "lang");
  });

  it("Geheimnis-Wächter auf Seite, Anhang, Titel und Entscheidung", async () => {
    const a = ctx(U.adminA, T.A);
    const r = await op("wissen_schreiben", a, { projectId: P.a1, slug: "geheim", inhalt: `# Zugang\n\nToken ${FALSCHER_TOKEN}` });
    expect(r.status).toBe(422);
    expect(r.message).toContain("Inhalt, Zeile 3");
    expect(r.message).not.toContain(FALSCHER_TOKEN);
    expect((await op("wissen_schreiben", a, { projectId: P.a1, slug: "stand", anhang: "Passwort: Sommer2026!" })).status).toBe(422);
    expect((await op("wissen_schreiben", a, { projectId: P.a1, slug: "geheim", titel: FALSCHER_TOKEN, inhalt: "ok" })).status).toBe(422);
    expect((await op("entscheidung_hinzufuegen", a, { projectId: P.a1, was: "Zugang", warum: `weil ${FALSCHER_TOKEN}` })).status).toBe(422);
    expect(await m.prisma.wissenSeite.count({ where: { projectId: P.a1, slug: "geheim" } })).toBe(0);
  });

  it("Sichtbarkeit: Mitglied schreibt, SubAdmin liest nur, bloß Zugewiesener sieht nichts", async () => {
    const mit = await op("wissen_schreiben", ctx(U.memberA, T.A), { projectId: P.a1, slug: "regeln", inhalt: "- Nie mergen ohne CI" });
    expect(mit.status).toBe(200);
    expect(mit.data).toMatchObject({ seite: { art: "regeln", angepinnt: true } });
    // Mitglied von Alpha, nicht von Beta
    expect((await op("wissen_lesen", ctx(U.memberA, T.A), { projectId: P.a2 })).status).toBe(404);

    const sub = ctx(U.subA, T.A);
    expect((await op("wissen_lesen", sub, { projectId: P.a1, slug: "regeln" })).status).toBe(200);
    expect((await op("wissen_schreiben", sub, { projectId: P.a1, slug: "regeln", anhang: "x" })).status).toBe(403);

    const aus = ctx(U.outsiderA, T.A);
    expect((await op("wissen_lesen", aus, { projectId: P.a1 })).status).toBe(404);
    expect((await op("projekt_kontext", aus, { projectId: P.a1 })).status).toBe(404);
    expect((await op("wissen_suchen", aus, { query: "Zebrafisch" })).data).toEqual({ treffer: [] });
    expect((await op("wissen_lesen", aus, {})).data).toEqual({ projekte: [] });
    const exp = await m.d.exportDateien(U.outsiderA, T.A);
    expect(exp.dateien.map((f) => f.inhalt).join("\n")).not.toContain("Zebrafisch");
  });

  it("Mandanten-Trennung: Token von B liest, sucht, schreibt und exportiert nie A", async () => {
    const b = ctx(U.adminB, T.B);
    await op("wissen_schreiben", b, { projectId: P.b1, slug: "stand", inhalt: "Fremdes Projekt Kranich." });

    for (const [name, params] of [
      ["wissen_lesen", { projectId: P.a1 }],
      ["wissen_lesen", { projectId: P.a1, slug: "stand" }],
      ["projekt_kontext", { projectId: P.a1 }],
      ["wissen_schreiben", { projectId: P.a1, slug: "stand", anhang: "Übernahme" }],
      ["wissen_schreiben", { projectId: P.a1, slug: "neu", inhalt: "x" }],
      ["entscheidung_hinzufuegen", { projectId: P.a1, was: "x", warum: "y" }],
    ] as const) {
      const r = await op(name, b, params);
      expect(r.status, `${name} ${JSON.stringify(params)}`).toBe(404);
    }
    expect((await op("wissen_suchen", b, { query: "Zebrafisch" })).data).toEqual({ treffer: [] });
    expect((await op("wissen_suchen", b, { query: "Zebrafisch", projectId: P.a1 })).data).toEqual({ treffer: [] });
    expect(((await op("wissen_lesen", b, {})).data!.projekte as { id: string }[]).map((p) => p.id)).toEqual([P.b1]);

    const alle = await m.d.exportDateien(U.adminB, T.B);
    const text = alle.dateien.map((f) => `${f.pfad}\n${f.inhalt}`).join("\n");
    expect(text).toContain("Kranich");
    expect(text).not.toMatch(/Zebrafisch|Alpha|Beta/);
    await expect(m.d.exportDateien(U.adminB, T.B, P.a1)).rejects.toMatchObject({ status: 404 });

    // Umgekehrt: A findet B nicht, auch nicht mit B's projectId.
    expect((await op("wissen_suchen", ctx(U.adminA, T.A), { query: "Kranich" })).data).toEqual({ treffer: [] });
    expect((await op("wissen_suchen", ctx(U.adminA, T.A), { query: "Kranich", projectId: P.b1 })).data).toEqual({ treffer: [] });
    // Nichts wurde in A geschrieben.
    expect(await m.prisma.wissenSeite.count({ where: { projectId: P.a1, slug: "neu" } })).toBe(0);
    expect(await m.prisma.entscheidung.count({ where: { projectId: P.a1 } })).toBe(0);
  });

  it("Suche: Volltext (deutsch, Stammform) + TOF-Nummer, mit Ausschnitt und Rang", async () => {
    const a = ctx(U.adminA, T.A);
    await op("wissen_schreiben", a, { projectId: P.a2, slug: "deploy", inhalt: "## Deploy\nDie Datenbanken werden vor jedem Deploy gesichert. Rollback per Image." });
    const r = await op("wissen_suchen", a, { query: "Datenbank sichern" });
    const treffer = r.data!.treffer as { slug: string; projectId: string; ausschnitt: string; rang: number; typ: string }[];
    expect(treffer[0]).toMatchObject({ typ: "seite", slug: "deploy", projectId: P.a2 });
    expect(treffer[0].ausschnitt).toContain("**");
    expect(treffer[0].rang).toBeGreaterThan(0);
    const tof = await op("wissen_suchen", a, { query: "TOF-0839", projectId: P.a1 });
    expect((tof.data!.treffer as { slug: string }[]).map((t) => t.slug)).toContain("stand");
    expect((await op("wissen_suchen", a, { query: "Datenbank", projectId: P.a1 })).data).toEqual({ treffer: [] });
  });

  it("Verlauf: wiederherstellen = neue Version mit altem Inhalt, nichts geht verloren", async () => {
    const vers = await m.prisma.wissenVersion.findMany({ where: { seite: { projectId: P.a1, slug: "stand" } }, orderBy: { createdAt: "asc" } });
    const erste = vers[0];
    const r = await m.d.seiteWiederherstellen(U.adminA, T.A, P.a1, "stand", erste.id);
    expect(r.unveraendert).toBe(false);
    const nach = await m.prisma.wissenVersion.findMany({ where: { seite: { projectId: P.a1, slug: "stand" } }, orderBy: { createdAt: "asc" } });
    expect(nach.length).toBe(vers.length + 1);
    expect(nach.at(-1)!.inhalt).toBe(erste.inhalt);
    expect((await m.d.seiteLesen(U.adminA, T.A, P.a1, "stand"))!.inhalt).toBe(erste.inhalt);
    // Version aus fremdem Mandanten/Projekt lässt sich nicht einspielen
    await expect(m.d.seiteWiederherstellen(U.adminB, T.B, P.b1, "stand", erste.id)).rejects.toMatchObject({ status: 404 });
  });

  it("Entscheidungen: nur anhängen, Korrektur verweist, TOF-Nummern werden gesammelt", async () => {
    const a = ctx(U.adminA, T.A);
    const e1 = await op("entscheidung_hinzufuegen", a, { projectId: P.a1, was: "Postgres-Volltext statt Vektor-DB", warum: "on-prem, keine Cloud", datum: "2026-11-03", aufgaben: ["tof-0839"] });
    expect(e1.status).toBe(200);
    expect(e1.data).toMatchObject({ wer: "Admin A", aufgaben: ["TOF-0839"] });
    const e2 = await op("entscheidung_hinzufuegen", a, { projectId: P.a1, was: "Doch mit Ranking", warum: "Treffer sortieren (TOF-0840)", korrigiertId: e1.data!.id });
    expect(e2.data).toMatchObject({ korrigiertId: e1.data!.id, aufgaben: ["TOF-0840"] });
    expect((await op("entscheidung_hinzufuegen", a, { projectId: P.a1, was: "x", warum: "y", korrigiertId: id("gibtsnicht") })).status).toBe(404);
    expect((await op("entscheidung_hinzufuegen", a, { projectId: P.a1, was: "x", warum: "" })).status).toBe(400);
    const s = await op("wissen_suchen", a, { query: "Vektor", projectId: P.a1 });
    expect((s.data!.treffer as { typ: string }[])[0]).toMatchObject({ typ: "entscheidung" });
  });

  it("projekt_kontext: kompakt, mit angepinnten Seiten, Entscheidungen, P1, wartet-auf-tarek, Schluss-Hinweis", async () => {
    const r = await op("projekt_kontext", ctx(U.adminA, T.A), { projectId: P.a1 });
    const md = String(r.data!.markdown);
    expect(md).toContain("# Projekt-Kontext: Alpha");
    expect(md).toContain("## Stand (stand,");
    expect(md).toContain("## Regeln (regeln,");
    expect(md).toContain("Postgres-Volltext statt Vektor-DB");
    expect(md).toMatch(/## Offene P1\/P2-Aufgaben\n\n- \[P1\] TOF-0839 — Wissen bauen — Außen A/);
    expect(md).toContain("## Wartet auf Tarek");
    expect(md).toContain("wissen_schreiben");
    expect(md).toContain("entscheidung_hinzufuegen");
    expect(md.length).toBeLessThanOrEqual(7000);

    // Große Seiten werden gekürzt, das Ganze bleibt klein.
    await m.d.seiteSchreiben(U.adminA, T.A, { projectId: P.a1, slug: "adressen", inhalt: "- Adresse\n".repeat(4000) });
    const gross = String((await op("projekt_kontext", ctx(U.adminA, T.A), { projectId: P.a1 })).data!.markdown);
    expect(gross.length).toBeLessThanOrEqual(7000);
    await m.d.seiteLoeschen(U.adminA, T.A, P.a1, "adressen");
  });

  it("Aufgaben-Verweise: Seite zeigt Aufgaben nach Sichtrecht; Aufgabe zeigt „erwähnt im Wissen“", async () => {
    const auf = await m.d.aufgabenZuTof(U.adminA, T.A, ["TOF-0839"]);
    expect(auf.map((x) => x.id)).toEqual([id("task1")]); // nie die gleichnamige Aufgabe aus B
    const erw = await m.d.wissenErwaehnungen(U.adminA, T.A, "TOF-0839 — Wissen bauen");
    expect(erw.seiten.map((s) => s.slug)).toContain("stand");
    expect(erw.entscheidungen.length).toBeGreaterThan(0);
    // Der bloß Zugewiesene sieht die Aufgabe, aber keine Wissen-Erwähnung (kein Projektzugang).
    expect(await m.d.wissenErwaehnungen(U.outsiderA, T.A, "TOF-0839 — Wissen bauen")).toEqual({ seiten: [], entscheidungen: [] });
    expect(await m.d.wissenErwaehnungen(U.adminB, T.B, "TOF-0839 — fremder Mandant")).toMatchObject({ seiten: [] });
  });

  it("Export: ZIP mit README, Seiten mit Front-Matter und ENTSCHEIDUNGEN.md", async () => {
    const e = await m.d.exportDateien(U.adminA, T.A, P.a1);
    const z = m.zip.leseZip(m.zip.baueZip(e.dateien));
    const pfade = z.map((f) => f.pfad);
    expect(pfade).toEqual(expect.arrayContaining(["README.md", "stand.md", "regeln.md", "ENTSCHEIDUNGEN.md"]));
    const stand = z.find((f) => f.pfad === "stand.md")!.inhalt;
    expect(stand).toMatch(/^---\ntitel: "Stand"\nslug: stand\nart: stand\nangepinnt: true\naktualisiert: /);
    expect(z.find((f) => f.pfad === "ENTSCHEIDUNGEN.md")!.inhalt).toContain("Postgres-Volltext statt Vektor-DB");
    const alle = await m.d.exportDateien(U.adminA, T.A);
    expect(alle.dateien[0].pfad).toBe("README.md");
    expect(alle.dateien.some((f) => /^alpha-[a-z0-9]{6}\/stand\.md$/.test(f.pfad))).toBe(true);
  });

  it("Kontext-Token: sieht genau die Wissen-Ops; /api/kontext.md liest jetzt das Wissen", async () => {
    const kontextOps = m.ops.availableOps(m.token.parseScopes("kontext")).sort();
    expect(kontextOps).toEqual(["entscheidung_hinzufuegen", "projekt_kontext", "wissen_lesen", "wissen_schreiben", "wissen_suchen"]);
    expect(m.ops.availableOps(m.token.parseScopes("kommentar"))).toEqual([]);
    expect(m.ops.availableOps(m.token.parseScopes("read"))).toEqual(expect.arrayContaining(["wissen_lesen", "wissen_suchen", "projekt_kontext"]));
    expect(m.ops.availableOps(m.token.parseScopes("read"))).not.toContain("wissen_schreiben");
    const k = await m.kontext.ladeKontexte(U.adminA, T.A, P.a1);
    expect(k[0].p.kontext).toContain("## Regeln");
    expect(k[0].p.kontext).toContain("Nie mergen ohne CI");
  });
});
