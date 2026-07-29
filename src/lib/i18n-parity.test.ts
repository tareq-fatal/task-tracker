import { describe, expect, it } from "vitest";
import { dictionaries } from "./i18n";
import { LOCALES } from "./enums";

// Locale parity: every locale must carry EXACTLY the same keys, none empty —
// a missing key would silently fall back or render the raw key string.
describe("i18n locale parity", () => {
  const ar = Object.keys(dictionaries.ar).sort();

  it("all locales (incl. Turkish) have the exact same key set", () => {
    for (const loc of LOCALES) {
      const keys = Object.keys(dictionaries[loc]).sort();
      expect(keys.length, loc).toBe(ar.length);
      expect(keys, loc).toEqual(ar);
    }
  });

  it("no empty values anywhere", () => {
    for (const loc of LOCALES) {
      const empty = Object.entries(dictionaries[loc]).filter(([, v]) => !String(v).trim());
      expect(empty, loc).toEqual([]);
    }
  });

  it("Turkish is really Turkish, not a copy of another locale", () => {
    const tr = dictionaries.tr as Record<string, string>;
    expect(tr["nav.dashboard"]).toBe("Görevlerim");
    expect(tr["status.Done"]).toBe("Tamamlandı");
    expect(tr["priority.Critical"]).toBe("Kritik");
    expect(tr["nav.newTask"]).toBe("Yeni Görev");
    // placeholder tokens survive translation
    expect(tr["search.noResults"]).toContain("{q}");
    expect(tr["deleted.by"]).toContain("{name}");
  });
});
