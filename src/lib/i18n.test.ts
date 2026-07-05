import { describe, expect, it } from "vitest";
import {
  dictionaries,
  errorKey,
  interpolate,
  translate,
  translatePlural,
} from "./i18n";

describe("dictionary parity", () => {
  const arOnlySuffix = /\.(zero|two|few|many)$/; // extra CLDR categories only Arabic uses

  it("de and en have exactly the same keys", () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(
      Object.keys(dictionaries.de).sort()
    );
  });

  it("ar has every de key (plus its extra plural categories)", () => {
    const ar = new Set(Object.keys(dictionaries.ar));
    for (const k of Object.keys(dictionaries.de)) {
      expect(ar.has(k), `missing in ar: ${k}`).toBe(true);
    }
    for (const k of ar) {
      if (!(k in dictionaries.de)) {
        expect(arOnlySuffix.test(k), `unexpected ar-only key: ${k}`).toBe(true);
      }
    }
  });
});

describe("interpolate", () => {
  it("replaces vars and leaves unknown placeholders", () => {
    expect(interpolate("{n} of {total}", { n: 3, total: 7 })).toBe("3 of 7");
    expect(interpolate("{x}", {})).toBe("{x}");
  });
});

describe("translate", () => {
  it("supports vars", () => {
    expect(translate("en", "time.doneAgo", { ago: "2h" })).toBe("Done 2h ago");
  });
});

describe("translatePlural", () => {
  it("picks one/other for German and English", () => {
    expect(translatePlural("de", "time.daysLeft", 1)).toBe("noch 1 Tag");
    expect(translatePlural("de", "time.daysLeft", 5)).toBe("noch 5 Tage");
    expect(translatePlural("en", "time.overdueBy", 1)).toBe("1 day overdue");
    expect(translatePlural("en", "time.overdueBy", 3)).toBe("3 days overdue");
  });

  it("uses Arabic dual and paucal categories", () => {
    // CLDR ar: 1 → one, 2 → two, 3-10 → few, 11-99 → many, 100 → other
    expect(translatePlural("ar", "time.daysLeft", 1)).toBe("متبقٍ يوم واحد");
    expect(translatePlural("ar", "time.daysLeft", 2)).toBe("متبقٍ يومان");
    expect(translatePlural("ar", "time.daysLeft", 5)).toBe("متبقٍ 5 أيام");
    expect(translatePlural("ar", "time.daysLeft", 15)).toBe("متبقٍ 15 يومًا");
    expect(translatePlural("ar", "time.daysLeft", 100)).toBe("متبقٍ 100 يوم");
  });

  it("falls back to .other when a category is missing", () => {
    // de has no .zero form → PluralRules gives "other" for 0 anyway
    expect(translatePlural("de", "list.deleteConfirm", 0)).toContain("0");
  });

  it("passes extra vars through", () => {
    expect(translatePlural("en", "nar.recommend", 2, { p: "High" })).toBe(
      "2 overdue tasks — focus on High"
    );
  });
});

describe("errorKey", () => {
  it("maps known codes and rejects free text", () => {
    expect(errorKey("FORBIDDEN")).toBe("error.forbidden");
    expect(errorKey("NO_FILE")).toBe("error.noFile");
    expect(errorKey("BLOCKED")).toBe("task.blocked");
    expect(errorKey("something went wrong")).toBeNull();
    expect(errorKey(null)).toBeNull();
  });
});
