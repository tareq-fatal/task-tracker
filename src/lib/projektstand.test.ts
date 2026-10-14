import { describe, expect, it } from "vitest";
import { berechneProjektstand, wochenStart, OHNE_PROJEKT, type StandAufgabe } from "./projektstand";

const jetzt = new Date("2026-10-14T12:00:00Z"); // Mittwoch
const P = [
  { id: "a", name: "Alpha", color: "#111111" },
  { id: "b", name: "Beta", color: "#222222" },
  { id: "leer", name: "Leer", color: "#333333" },
];
let n = 0;
const auf = (o: Partial<StandAufgabe>): StandAufgabe => ({
  id: "t" + ++n, title: "T" + n, status: "Todo", priority: "Medium", dueDate: null,
  completedAt: null, updatedAt: new Date("2026-10-01T00:00:00Z"), projectId: "a", ...o,
});

describe("Projektstand", () => {
  it("Woche beginnt Montag", () => {
    expect(wochenStart(jetzt).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(wochenStart(new Date("2026-10-18T23:00:00Z")).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("zählt je Projekt erledigt / in Arbeit / offen, Archiv zählt nicht", () => {
    const s = berechneProjektstand([
      auf({ status: "Done", completedAt: new Date("2026-10-13T00:00:00Z") }),
      auf({ status: "InProgress" }),
      auf({}),
      auf({ status: "Archived" }),
      auf({ projectId: "b", status: "Done", completedAt: new Date("2026-01-01T00:00:00Z") }),
    ], P, jetzt, 4);
    const a = s.projekte.find((z) => z.id === "a")!;
    expect([a.erledigt, a.inArbeit, a.offen, a.gesamt, a.prozent]).toEqual([1, 1, 1, 3, 33]);
    expect(s.gesamt).toMatchObject({ erledigt: 2, inArbeit: 1, offen: 1, gesamt: 4, prozent: 50, erledigtImZeitraum: 1 });
  });

  it("jedes Projekt erscheint ohne Konfiguration, auch leer; Aufgaben ohne Projekt eigene Zeile", () => {
    const s = berechneProjektstand([auf({ projectId: null })], P, jetzt, 4);
    expect(s.projekte.map((z) => z.id).sort()).toEqual(["a", "b", "leer", OHNE_PROJEKT].sort());
    expect(s.projekte[s.projekte.length - 1].gesamt).toBe(0);
  });

  it("Prio und überfällig nur für nicht Erledigtes", () => {
    const s = berechneProjektstand([
      auf({ priority: "Critical", dueDate: new Date("2026-10-01T00:00:00Z") }),
      auf({ priority: "Critical", status: "Done", completedAt: jetzt, dueDate: new Date("2026-10-01T00:00:00Z") }),
      auf({ priority: "High", dueDate: new Date("2026-11-01T00:00:00Z") }),
    ], P, jetzt, 4);
    const a = s.projekte.find((z) => z.id === "a")!;
    expect(a.prio).toEqual({ Critical: 1, High: 1, Medium: 0, Low: 0 });
    expect(a.ueberfaellig).toBe(1);
  });

  it("Verlauf: erledigt je Woche im Zeitraum, älteres fällt heraus", () => {
    const s = berechneProjektstand([
      auf({ status: "Done", completedAt: new Date("2026-10-14T08:00:00Z") }),
      auf({ status: "Done", completedAt: new Date("2026-10-12T08:00:00Z") }),
      auf({ status: "Done", completedAt: new Date("2026-09-22T08:00:00Z") }),
      auf({ status: "Done", completedAt: new Date("2026-08-01T08:00:00Z") }),
    ], P, jetzt, 4);
    expect(s.wochen.map((w) => w.label)).toEqual(["21.09.", "28.09.", "05.10.", "12.10."]);
    expect(s.wochen.map((w) => w.count)).toEqual([1, 0, 0, 2]);
    expect(s.zuletztErledigt.map((t) => t.completedAt!.toISOString().slice(0, 10))).toEqual(["2026-10-14", "2026-10-12", "2026-09-22"]);
  });

  it("letzte Aktivität und Liste „in Arbeit“ nach jüngster Änderung", () => {
    const s = berechneProjektstand([
      auf({ status: "InProgress", updatedAt: new Date("2026-10-02T00:00:00Z"), title: "alt" }),
      auf({ status: "InProgress", updatedAt: new Date("2026-10-10T00:00:00Z"), title: "neu" }),
    ], P, jetzt, 4);
    expect(s.inArbeit.map((t) => t.title)).toEqual(["neu", "alt"]);
    expect(s.projekte.find((z) => z.id === "a")!.letzteAktivitaet!.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });
});
