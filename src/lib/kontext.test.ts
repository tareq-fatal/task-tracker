import { describe, expect, it } from "vitest";
import { alleKontexteMd, aufgabenListe, darfKommentieren, darfKontextLesen, projektKontextMd, KONTEXT_VORLAGE, type KontextAufgabe } from "./kontext";
import { hasScope, opSichtbar, parseScopes, serializeScopes } from "./api-token";

// availableOps() in mcp/ops.ts filtert genau mit opSichtbar (ops.ts ist server-only).
const mcpSichtbar = (csv: string) => opSichtbar(parseScopes(csv), "read") || opSichtbar(parseScopes(csv), "write");

const B = "https://tasks.example";
const jetzt = new Date("2026-10-15T12:00:00Z");
let n = 0;
const auf = (o: Partial<KontextAufgabe>): KontextAufgabe => ({
  id: "t" + ++n, title: "A" + n, status: "Todo", priority: "Medium", dueDate: null, completedAt: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"), ...o,
});
const P = { id: "p1", name: "MoT Syrien", description: "RFI Kennzeichen", kontext: "## Ziel\nAuktion\n\n## Stand\nAbgegeben", kontextStand: { am: new Date("2026-10-15T08:00:00Z"), von: "Tarek" } };

describe("Kontext: Scopes sind eng", () => {
  it("kontext liest, darf nicht kommentieren und öffnet das MCP nicht", () => {
    const s = parseScopes("kontext");
    expect(darfKontextLesen(s)).toBe(true);
    expect(darfKommentieren(s)).toBe(false);
    expect(hasScope(s, "read")).toBe(false);
    expect(hasScope(s, "write")).toBe(false);
    expect(mcpSichtbar("kontext")).toBe(false);
  });
  it("kommentar kommentiert, liest keinen Kontext, öffnet das MCP nicht", () => {
    const s = parseScopes("kommentar");
    expect(darfKommentieren(s)).toBe(true);
    expect(darfKontextLesen(s)).toBe(false);
    expect(mcpSichtbar("kommentar")).toBe(false);
  });
  it("read/write behalten ihre Rechte; write darf auch kommentieren", () => {
    expect(darfKontextLesen(parseScopes("read"))).toBe(true);
    expect(darfKommentieren(parseScopes("read"))).toBe(false);
    expect(darfKommentieren(parseScopes("write"))).toBe(true);
    expect(mcpSichtbar("read")).toBe(true);
    expect(opSichtbar(parseScopes("read"), "write")).toBe(false);
  });
  it("Speicherform bleibt stabil", () => {
    expect(serializeScopes(["kommentar", "kontext"])).toBe("kontext,kommentar");
    expect(serializeScopes(["bogus", "kontext"])).toBe("kontext");
  });
});

describe("Kontext: Markdown", () => {
  it("Aufgabenliste: in Arbeit vor offen, dann Priorität, danach zuletzt erledigt", () => {
    const z = aufgabenListe([
      auf({ title: "offen-P3" }),
      auf({ title: "offen-P1", priority: "Critical", dueDate: new Date("2026-10-20T00:00:00Z") }),
      auf({ title: "arbeit", status: "InProgress", priority: "Low" }),
      auf({ title: "fertig", status: "Done", completedAt: new Date("2026-10-14T00:00:00Z") }),
      auf({ title: "archiv", status: "Archived" }),
    ], B);
    expect(z.map((x) => x.split("] ")[1].split(" ")[1])).toEqual(["arbeit", "offen-P1", "offen-P3", "fertig"]);
    expect(z[1]).toContain("P1 offen-P1 · fällig 2026-10-20");
    expect(z[3]).toContain("[erledigt]");
    expect(z[3]).toContain("erledigt 2026-10-14");
    expect(z[0]).toMatch(new RegExp(`— ${B}/tasks/t\\d+$`));
  });

  it("ein Projekt: Kopf mit Stand und Autor, Kontext, Aufgaben", () => {
    const md = projektKontextMd(P, [auf({}), auf({ status: "Done", completedAt: jetzt })], B, jetzt);
    expect(md.startsWith("# MoT Syrien\n")).toBe(true);
    expect(md).toContain("Kontext zuletzt geändert 2026-10-15 von Tarek");
    expect(md).toContain("## Stand\nAbgegeben");
    expect(md).toContain("## Aufgaben (1 offen, 1 erledigt)");
  });

  it("ohne Kontext: klarer Hinweis statt leerer Stelle", () => {
    const md = projektKontextMd({ ...P, kontext: null, kontextStand: null }, [], B, jetzt);
    expect(md).toContain("noch kein Kontext gepflegt");
    expect(md).toContain("_(Kein Kontext hinterlegt.)_");
    expect(md).toContain("_(keine)_");
  });

  it("alle Projekte kompakt: Kontext gekürzt, Verweis auf die volle Fassung", () => {
    const lang = { ...P, kontext: Array.from({ length: 20 }, (_, i) => `Zeile ${i + 1}`).join("\n") };
    const md = alleKontexteMd([{ p: lang, aufgaben: [auf({ status: "InProgress" })] }], B, jetzt, 12, 5);
    expect(md).toContain("Zeile 12");
    expect(md).not.toContain("Zeile 13");
    expect(md).toContain("_… 8 weitere Zeilen in der vollen Fassung_");
    expect(md).toContain(`voll: ${B}/api/projekte/p1/kontext.md`);
    expect(md).toContain("Wichtigste offene Aufgaben:");
  });

  it("Vorlage enthält alle verlangten Abschnitte", () => {
    for (const h of ["Ziel", "Stand", "Wichtige Entscheidungen", "Systeme, Links, Repos", "Ansprechpartner", "Regeln / No-Gos", "Offene Fragen", "Letzte Änderungen"]) {
      expect(KONTEXT_VORLAGE).toContain(`## ${h}`);
    }
  });
});
