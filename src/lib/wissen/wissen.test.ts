import { describe, expect, it } from "vitest";
import { findeGeheimnis, geheimnisMeldung, pruefeAufGeheimnisse } from "./geheimnis";
import {
  abschnitt,
  entscheidungenAlsMarkdown,
  exportReadme,
  haengeAn,
  kuerze,
  seiteAlsMarkdown,
  seitenVerweise,
  slugify,
  SLUG_RE,
  tofVerweise,
  zeilenDiff,
} from "./text";
import { baueZip, crc32, leseZip } from "./zip";

// TOF-0839 Projekt-Wissen — reine Funktionen (ohne DB). Die DB-Pfade (Mandant, Sichtbarkeit,
// Versionen, Suche, Export) prüft dienst.db.test.ts gegen ein echtes Postgres.

// Testwerte werden zusammengesetzt, damit kein Scanner sie für echte Schlüssel hält.
const J = (...t: string[]) => t.join("");

describe("Geheimnis-Wächter", () => {
  const faelle: [string, string][] = [
    ["Task-Tracker-Token", J("Token: tt_", "mcp_", "a1b2c3d4e5f6a7b8c9d0")],
    ["API-Schlüssel (sk-…)", J("key sk-", "ant-", "api03-AbCdEfGhIjKlMnOpQrSt")],
    ["GitHub-Token", J("gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4")],
    ["AWS-Zugangsschlüssel", J("AK", "IA", "ABCDEFGHIJKLMNOP")],
    ["JWT", J("ey", "JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV")],
    ["privater Schlüssel", J("-----BEGIN OPENSSH ", "PRIVATE KEY-----")],
    ["Passwort/Schlüssel mit Wert", "Passwort: Sommer2026!"],
    ["Passwort/Schlüssel mit Wert", "password = hunter2"],
    ["Passwort/Schlüssel mit Wert", J("SESSION_", "SECRET=", "abc123def")],
    ["Passwort in einer Adresse", J("postgres://app:", "geheim99@db:5432/x")],
    ["lange Zufallszeichenkette (Schlüssel?)", J("Q2hhbmdlTWUh", "c2VjcmV0S2V5MTIzNDU2Nzg5MGFiY2Rl")],
    ["lange Zufallszeichenkette (Schlüssel?)", J("9f86d081884c7d659a2feaa0c55ad015", "a3bf4f1b2b0b822cd15d6c15b0f00a08")],
  ];
  for (const [art, zeile] of faelle) {
    it(`erkennt ${art}: ${zeile.slice(0, 18)}…`, () => {
      const f = findeGeheimnis(`# Titel\n\nText\n${zeile}\nmehr`);
      expect(f).toEqual({ zeile: 4, art });
    });
  }

  it("lässt normale Wissen-Texte durch (Pfade, Git-Hashes, Platzhalter, Adressen)", () => {
    const ok = [
      "Deploy: gh workflow run deploy.yml, Backup in /home/marisight/backups/task-tracker/pre-deploy/",
      "Commit 017939c4e5d8a2b1c0f9e8d7c6b5a4f3e2d1c0b9 ist der Stand",
      "Passwort: siehe Passwort-Manager",
      "password: <im Tresor>",
      "TASK_TRACKER_TOKEN=<token>",
      "API-Key: ***",
      "Token mit Scope kontext, Präfix tt_mcp_… (nie den Wert notieren)",
      "https://tasks.coastshield.net/projects/cmssz6cce006u1sx43uyo9hvi/wissen",
      "src/app/(app)/projects/[id]/wissen/[slug]/page.tsx",
      "SYNC_SECRET ist optional",
      "Projekt-Id cmssz6cce006u1sx43uyo9hvi, Aufgabe TOF-0839",
    ];
    for (const z of ok) expect(findeGeheimnis(z), z).toBeNull();
  });

  it("Meldung nennt Feld, Zeile und Art — nie den Wert", () => {
    const wert = J("gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4");
    const m = pruefeAufGeheimnisse({ Titel: "ok", Inhalt: `a\n${wert}` });
    expect(m).toContain("Inhalt, Zeile 2");
    expect(m).toContain("GitHub-Token");
    expect(m).not.toContain(wert);
    expect(geheimnisMeldung({ zeile: 7, art: "JWT" })).toMatch(/^Zeile 7 sieht nach einem Zugangsdatum aus/);
  });
});

describe("Text-Hilfen", () => {
  it("slugify: deutsch, ASCII, kurz", () => {
    expect(slugify("Über uns & Ziele")).toBe("ueber-uns-ziele");
    expect(slugify("  Deploy / Rollback  ")).toBe("deploy-rollback");
    expect(SLUG_RE.test("deploy-rollback")).toBe(true);
    expect(SLUG_RE.test("-x")).toBe(false);
    expect(SLUG_RE.test("Gross")).toBe(false);
  });

  it("findet TOF-Nummern und [[slug]]-Verweise", () => {
    const t = "Siehe TOF-0839 und TOF-0001, nicht TOF-12. Mehr in [[Deploy]] und [[regeln|die Regeln]]. TOF-0839";
    expect(tofVerweise(t)).toEqual(["TOF-0001", "TOF-0839"]);
    expect(seitenVerweise(t)).toEqual(["deploy", "regeln"]);
  });

  it("anhang: hängt mit Datum an, ohne den alten Text anzufassen", () => {
    const d = new Date("2026-11-03T10:00:00Z");
    expect(haengeAn("## Stand\nalt\n\n", "neu", d)).toBe("## Stand\nalt\n\n### 2026-11-03\n\nneu\n");
    expect(haengeAn("", "## Eigen\nx", d)).toBe("## Eigen\nx\n");
    expect(haengeAn("alt", "   ", d)).toBe("alt");
  });

  it("Zeilen-Diff markiert neu/weg", () => {
    const d = zeilenDiff("a\nb\nc", "a\nB\nc\nd");
    expect(d.filter((z) => z.typ !== "gleich")).toEqual([
      { typ: "weg", text: "b" },
      { typ: "neu", text: "B" },
      { typ: "neu", text: "d" },
    ]);
  });

  it("abschnitt holt „## Ziel“ bis zur nächsten gleich hohen Überschrift", () => {
    const md = "# X\n## Ziel\nZiel-Text\n### Unter\nmehr\n## Stand\nS";
    expect(abschnitt(md, ["ziel"])).toBe("Ziel-Text\n### Unter\nmehr");
    expect(abschnitt(md, ["fehlt"])).toBeNull();
    expect(kuerze("eins zwei drei vier", 10)).toBe("eins zwei …");
  });
});

describe("Export-Format", () => {
  const seite = {
    slug: "stand",
    titel: 'Stand "aktuell"',
    art: "stand",
    angepinnt: true,
    inhalt: "## Ziel\nTOF-0839 fertig\r\n",
    aktualisiertAm: new Date("2026-11-03T08:00:00Z"),
    aktualisiertVon: "Tarek",
  };

  it("Seite mit YAML-Front-Matter (titel, art, aktualisiert, aufgaben)", () => {
    const md = seiteAlsMarkdown(seite);
    expect(md.startsWith("---\ntitel: \"Stand \\\"aktuell\\\"\"\nslug: stand\nart: stand\nangepinnt: true\naktualisiert: 2026-11-03T08:00:00.000Z\n")).toBe(true);
    expect(md).toContain('aufgaben: ["TOF-0839"]');
    expect(md).toContain("---\n\n## Ziel\nTOF-0839 fertig\n");
  });

  it("ENTSCHEIDUNGEN.md als Tabelle, Pipes maskiert", () => {
    const md = entscheidungenAlsMarkdown("P", [
      { id: "e1", datum: new Date("2026-11-01T12:00:00Z"), wer: "Tarek", was: "A | B", warum: "weil\nso", aufgaben: ["TOF-0839"], korrigiertId: null },
    ]);
    expect(md).toContain("| 2026-11-01 | Tarek | A \\| B | weil <br> so | TOF-0839 |");
  });

  it("README listet Seiten nach Art", () => {
    const r = exportReadme({ id: "p1", name: "Proj" }, [seite], "https://x");
    expect(r).toContain("## Stand");
    expect(r).toContain("- [Stand \"aktuell\"](stand.md) (angepinnt)");
    expect(r).toContain("https://x/projects/p1/wissen");
  });

  it("ZIP: Rundreise mit UTF-8-Namen und CRC", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    const z = baueZip([
      { pfad: "a/README.md", inhalt: "# Ä\n" },
      { pfad: "a/stand.md", inhalt: "x".repeat(5000) },
    ]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    expect(leseZip(z)).toEqual([
      { pfad: "a/README.md", inhalt: "# Ä\n" },
      { pfad: "a/stand.md", inhalt: "x".repeat(5000) },
    ]);
  });
});
