import { describe, expect, it } from "vitest";
import { asLocale, contentHash, shouldTranslate } from "./translation-policy";

describe("shouldTranslate — TR↔x only (Kundenregel 2026-08-02)", () => {
  it("translates every Turkish pair, both directions", () => {
    expect(shouldTranslate("tr", "ar")).toBe(true);
    expect(shouldTranslate("tr", "de")).toBe(true);
    expect(shouldTranslate("tr", "en")).toBe(true);
    expect(shouldTranslate("ar", "tr")).toBe(true);
    expect(shouldTranslate("de", "tr")).toBe(true);
    expect(shouldTranslate("en", "tr")).toBe(true);
  });

  it("NEVER translates between ar/de/en — that group is multilingual", () => {
    expect(shouldTranslate("ar", "de")).toBe(false);
    expect(shouldTranslate("de", "ar")).toBe(false);
    expect(shouldTranslate("en", "ar")).toBe(false);
    expect(shouldTranslate("de", "en")).toBe(false);
  });

  it("same language → no translation (T3)", () => {
    expect(shouldTranslate("tr", "tr")).toBe(false);
    expect(shouldTranslate("de", "de")).toBe(false);
  });

  it("unknown/missing languages → no translation", () => {
    expect(shouldTranslate(null, "tr")).toBe(false);
    expect(shouldTranslate("tr", undefined)).toBe(false);
    expect(shouldTranslate("fr", "tr")).toBe(false);
    expect(shouldTranslate("tr", "xx")).toBe(false);
  });
});

describe("contentHash", () => {
  it("is stable and content-sensitive", () => {
    expect(contentHash("Bu görev acildir")).toBe(contentHash("Bu görev acildir"));
    expect(contentHash("Bu görev acildir")).not.toBe(contentHash("Bu görev acildir!"));
    expect(contentHash("a")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("asLocale", () => {
  it("narrows to known locales only", () => {
    expect(asLocale("tr")).toBe("tr");
    expect(asLocale("fr")).toBeNull();
    expect(asLocale(null)).toBeNull();
  });
});
