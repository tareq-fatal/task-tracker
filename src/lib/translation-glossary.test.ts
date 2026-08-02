import { describe, expect, it } from "vitest";
import { applyGlossary, restoreGlossary } from "./translation-glossary";

describe("applyGlossary", () => {
  it("masks a Turkish term incl. its case suffix and restores the German form", () => {
    const { masked, slots } = applyGlossary("Yarın tugaya rapor verin.", "tr", "de");
    expect(masked).not.toContain("tugay");
    expect(masked).toMatch(/731\d{3}/);
    expect(slots).toHaveLength(1);
    const restored = restoreGlossary(masked, slots);
    expect(restored).toContain("Brigade");
  });

  it("masks multi-word terms (longest first)", () => {
    const { masked, slots } = applyGlossary("Devriye botu limandan ayrıldı.", "tr", "ar");
    expect(masked).not.toContain("devriye");
    expect(slots[0].replacement).toBe("قارب الدورية");
  });

  it("maps German plural forms to the Turkish canonical term", () => {
    const { masked, slots } = applyGlossary("Beide Hafenkräne prüfen.", "de", "tr");
    expect(masked).not.toContain("Hafenkräne");
    expect(slots[0].replacement).toBe("liman vinci");
  });

  it("does not touch text without glossary terms", () => {
    const { masked, slots } = applyGlossary("Bitte kurz bestätigen.", "de", "tr");
    expect(masked).toBe("Bitte kurz bestätigen.");
    expect(slots).toHaveLength(0);
  });

  it("does not match inside larger words", () => {
    // "Kaimauer" darf nicht als "Kai" gegriffen werden
    const { slots } = applyGlossary("Die Kaimauer ist beschädigt.", "de", "tr");
    expect(slots).toHaveLength(0);
  });

  it("avoids token collisions with numbers already in the text", () => {
    const { masked, slots } = applyGlossary("tugay Bericht 731000 prüfen", "tr", "de");
    expect(slots[0].token).not.toBe("731000");
    expect(restoreGlossary(masked, slots)).toContain("731000");
  });
});

describe("restoreGlossary", () => {
  it("returns null when the model swallowed a token — caller retries plain", () => {
    expect(restoreGlossary("Der Kommandeur ist da.", [{ token: "731000", replacement: "Brigade" }])).toBeNull();
  });
});
