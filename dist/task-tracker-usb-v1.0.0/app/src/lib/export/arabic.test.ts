import { describe, it, expect } from "vitest";
import { shapeArabic, shapeForLocale, hasArabic, isArabicChar } from "./arabic";

const cp = (...codes: number[]) => String.fromCodePoint(...codes);

describe("hasArabic / isArabicChar", () => {
  it("detects Arabic script", () => {
    expect(hasArabic("مرحبا")).toBe(true);
    expect(hasArabic("Hello")).toBe(false);
    expect(hasArabic("Task 5")).toBe(false);
    expect(isArabicChar("ب".codePointAt(0)!)).toBe(true);
    expect(isArabicChar("A".codePointAt(0)!)).toBe(false);
  });
});

describe("shapeArabic contextual joining", () => {
  it("shapes a single letter to its isolated form", () => {
    // beh (U+0628) isolated = U+FE8F
    expect(shapeArabic("ب")).toBe(cp(0xfe8f));
  });

  it("joins two dual-joining letters (initial + final) and reverses for RTL", () => {
    // beh + teh → initial beh (FE91), final teh (FE96); RTL visual order flips.
    expect(shapeArabic("بت")).toBe(cp(0xfe96, 0xfe91));
  });

  it("uses the medial form for a middle dual-joining letter", () => {
    // beh + beh + beh → initial, medial, final; reversed for RTL.
    expect(shapeArabic("ببب")).toBe(cp(0xfe90, 0xfe92, 0xfe91));
  });

  it("does not give a right-joining letter an initial form", () => {
    // reh (U+0631, right-joining) + beh: reh can't join forward, so beh stays isolated.
    // logical: reh(isolated FEAD), beh(isolated FE8F) → reversed → [FE8F, FEAD]
    expect(shapeArabic("رب")).toBe(cp(0xfe8f, 0xfead));
  });

  it("forms the LAM-ALEF ligature", () => {
    // lam (0644) + alef (0627) → isolated ligature FEFB
    expect(shapeArabic("لا")).toBe(cp(0xfefb));
  });
});

describe("simplified bidi", () => {
  it("keeps embedded Latin/numbers left-to-right within an RTL run", () => {
    const out = shapeArabic("بت 5A");
    // The "5A" run must remain in order somewhere in the output.
    expect(out).toContain("5A");
    // And the Arabic part is present as presentation forms.
    expect(out).toContain(cp(0xfe96));
  });
});

describe("shapeForLocale", () => {
  it("only transforms Arabic locale", () => {
    expect(shapeForLocale("Hello", "en")).toBe("Hello");
    expect(shapeForLocale("Hello", "de")).toBe("Hello");
    // Non-Arabic text under ar locale is untouched.
    expect(shapeForLocale("Hello", "ar")).toBe("Hello");
    // Arabic text under ar locale is shaped (differs from input).
    expect(shapeForLocale("بت", "ar")).not.toBe("بت");
  });
});
