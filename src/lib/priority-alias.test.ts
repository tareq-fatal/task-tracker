import { describe, expect, it } from "vitest";
import { PRIORITY_SHORT, resolvePriority, TASK_PRIORITIES } from "./enums";

// Tarek spricht von P1–P4, gespeichert ist Critical/High/Medium/Low. Ohne diese
// Übersetzung scheitert jeder Aufruf, der die Hausschreibweise benutzt.
describe("resolvePriority", () => {
  it("nimmt P1–P4", () => {
    expect(resolvePriority("P1")).toBe("Critical");
    expect(resolvePriority("p2")).toBe("High");
    expect(resolvePriority("P3")).toBe("Medium");
    expect(resolvePriority("p4")).toBe("Low");
  });

  it("nimmt die deutschen Wörter", () => {
    expect(resolvePriority("kritisch")).toBe("Critical");
    expect(resolvePriority("Hoch")).toBe("High");
    expect(resolvePriority("mittel")).toBe("Medium");
    expect(resolvePriority("gering")).toBe("Low");
    expect(resolvePriority("niedrig")).toBe("Low");
  });

  it("nimmt den gespeicherten Wert selbst, in jeder Schreibweise", () => {
    for (const p of TASK_PRIORITIES) {
      expect(resolvePriority(p)).toBe(p);
      expect(resolvePriority(p.toUpperCase())).toBe(p);
    }
    expect(resolvePriority("  High  ")).toBe("High");
  });

  it("gibt null zurück, statt etwas zu erfinden", () => {
    expect(resolvePriority("P5")).toBeNull();
    expect(resolvePriority("dringend")).toBeNull();
    expect(resolvePriority("")).toBeNull();
  });

  it("die Kurzform ist die Umkehrung", () => {
    for (const p of TASK_PRIORITIES) {
      expect(resolvePriority(PRIORITY_SHORT[p])).toBe(p);
    }
  });
});
