import { describe, it, expect } from "vitest";
import { columnForStatusChange, nextWorkflowColumn, WORKFLOW_CHAIN, columnOf, statusForColumn, stickyRotation, isOverWip, isScrumColumn, SCRUM_COLUMNS } from "./scrum";

describe("columnOf", () => {
  it("uses explicit scrumColumn when valid", () => {
    expect(columnOf({ scrumColumn: "to-verify", status: "Todo" })).toBe("to-verify");
  });
  it("derives from status when scrumColumn null/invalid", () => {
    expect(columnOf({ scrumColumn: null, status: "InProgress" })).toBe("in-progress");
    expect(columnOf({ scrumColumn: "garbage", status: "Done" })).toBe("done");
    expect(columnOf({ scrumColumn: null, status: "Todo" })).toBe("to-do");
  });
});

describe("statusForColumn", () => {
  it("maps the 6 columns to 3 statuses", () => {
    expect(statusForColumn("to-do")).toBe("Todo");
    expect(statusForColumn("in-progress")).toBe("InProgress");
    expect(statusForColumn("waiting")).toBe("InProgress");
    expect(statusForColumn("to-verify")).toBe("InProgress");
    expect(statusForColumn("done")).toBe("Done");
    expect(statusForColumn("ready-for-golive")).toBe("Done");
  });
});

describe("stickyRotation", () => {
  it("is deterministic and within ±2°", () => {
    const a = stickyRotation("abc123");
    expect(stickyRotation("abc123")).toBe(a);
    for (const id of ["x", "task-1", "cmq9", "zzzz"]) {
      expect(Math.abs(stickyRotation(id))).toBeLessThanOrEqual(2);
    }
  });
});

describe("isOverWip / isScrumColumn", () => {
  it("flags over-limit only for limited columns", () => {
    expect(isOverWip("in-progress", 7)).toBe(true);
    expect(isOverWip("in-progress", 6)).toBe(false);
    expect(isOverWip("to-do", 100)).toBe(false); // no limit
  });
  it("validates column keys", () => {
    expect(isScrumColumn("done")).toBe(true);
    expect(isScrumColumn("nope")).toBe(false);
    // 4 Ablaufschritte + Rückstand + zwei Nebengleise + Abschluss.
    expect(SCRUM_COLUMNS).toHaveLength(8);
    expect(isScrumColumn("self-test")).toBe(true);
    expect(isScrumColumn("release")).toBe(true);
  });
});

describe("Ablauf-Kette (Tarek, 16.08.2026)", () => {
  it("führt in der vereinbarten Reihenfolge", () => {
    expect([...WORKFLOW_CHAIN]).toEqual(["in-progress", "self-test", "to-verify", "release"]);
    expect(nextWorkflowColumn("in-progress")).toBe("self-test");
    expect(nextWorkflowColumn("self-test")).toBe("to-verify");
    expect(nextWorkflowColumn("to-verify")).toBe("release");
  });

  it("endet nach dem Release — geschlossen wird eigens", () => {
    expect(nextWorkflowColumn("release")).toBeNull();
  });

  it("kennt die Nebengleise nicht als Schritt", () => {
    expect(nextWorkflowColumn("waiting")).toBeNull();
    expect(nextWorkflowColumn("to-do")).toBeNull();
  });

  it("hält jeden Schritt der Kette offen — nur `done` ist erledigt", () => {
    for (const col of WORKFLOW_CHAIN) {
      expect(statusForColumn(col), col).toBe("InProgress");
    }
    // Der Kern der Regel: ausgeliefert ist noch nicht geschlossen.
    expect(statusForColumn("release")).not.toBe("Done");
    expect(statusForColumn("done")).toBe("Done");
  });

  it("lässt eine Karte ohne gesetzte Spalte weiterhin über den Status finden", () => {
    expect(columnOf({ scrumColumn: null, status: "InProgress" })).toBe("in-progress");
    expect(columnOf({ scrumColumn: "release", status: "InProgress" })).toBe("release");
  });
});

describe("columnForStatusChange", () => {
  it("holt eine geschlossene Karte aus der Ablaufspalte heraus", () => {
    // Sonst stünde eine erledigte Aufgabe weiter unter „Release" und das
    // Board zeigte sie als laufende Arbeit.
    expect(columnForStatusChange("Done", "release")).toBe("done");
    expect(columnForStatusChange("Done", "to-verify")).toBe("done");
    expect(columnForStatusChange("Archived", "in-progress")).toBe("done");
  });

  it("lässt eine bereits abgeschlossene Karte in Ruhe", () => {
    expect(columnForStatusChange("Done", "done")).toBeNull();
    expect(columnForStatusChange("Done", "ready-for-golive")).toBeNull();
  });

  it("holt eine wieder geöffnete Karte aus der Erledigt-Spalte", () => {
    expect(columnForStatusChange("InProgress", "done")).toBe("in-progress");
    expect(columnForStatusChange("Todo", "done")).toBe("to-do");
  });

  it("mischt sich zwischen den offenen Spalten nicht ein", () => {
    // Dort trägt die Spalte mehr Bedeutung als der Status — alle vier
    // Schritte der Kette sind derselbe Status.
    for (const col of ["in-progress", "self-test", "to-verify", "release", "waiting"]) {
      expect(columnForStatusChange("InProgress", col), col).toBeNull();
    }
  });

  it("kommt mit einer Karte ohne gesetzte Spalte zurecht", () => {
    expect(columnForStatusChange("Done", null)).toBe("done");
    expect(columnForStatusChange("InProgress", null)).toBeNull();
  });
});
